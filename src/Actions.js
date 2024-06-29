
import {
    AppState, Document, Stack, DissectUndoStack,
    ExprPath, Expr, CommandExpr, InfixExpr, PlaceholderExpr, TextExpr, SequenceExpr,
    DelimiterExpr, SubscriptSuperscriptExpr, ArrayExpr,
    ExprItem, TextItem, CodeItem
} from './Models';


// Holds context for the text entry mode line editor (InputContext.text_entry).
// Fields:
// 'mode': Type of text entry currently being performed.
//         (these strings also correspond to the InputContext mode).
//     'text_entry': ["] - text entry will become a TextItem (a section heading if Shift+Enter is used)
//     'math_text_entry': [\] - text entry will become a ExprItem with either normal italic math text
//         (if Enter is used) or \mathrm roman math text (if Shift+Enter)
//     'latex_entry': [\][\] - text entry will become a ExprItem with an arbitrary LaTeX command
// 'text': The string to be edited (editing is done non-destructively).
// 'edited_item': If this is set, this is the Item that is currently being edited.
//      While it's being edited, it doesn't exist on the stack and is temporarily held here.
//      If the editor is cancelled, this item will be placed back on the stack.
// 'cursor_position':
//     0: for beginning of string,
//     text.length: after end of string (the usual case)
class TextEntryState {
    constructor(mode, text, edited_item) {
        this.mode = mode;
        this.current_text = text || '';
        this.cursor_position = this.current_text.length;
        this.edited_item = edited_item;
    }

    is_empty() {
        return this.current_text.length === 0;
    }

    insert(s) {
        this.current_text = [
            this.current_text.slice(0, this.cursor_position),
            s,
            this.current_text.slice(this.cursor_position)].join('');
        this.cursor_position++;
    }

    backspace() {
        if(this.cursor_position > 0) {
            this.cursor_position--;
            this.current_text = [
                this.current_text.slice(0, this.cursor_position),
                this.current_text.slice(this.cursor_position+1)].join('');
        }
    }

    move(direction) {
        if(direction === 'left' && this.cursor_position > 0)
            this.cursor_position--;
        if(direction === 'right' && this.cursor_position < this.current_text.length)
            this.cursor_position++;
        if(direction === 'begin')
            this.cursor_position = 0;
        if(direction === 'end')
            this.cursor_position = this.current_text.length;
    }
}


// This acts as a sort of extension to the main App component.
// TODO: rename -> EditorActions or something
class InputContext {
    constructor(app_component, settings) {
        this.app_component = app_component;
        this.settings = settings;

        // Current keymap mode.
        this.mode = 'base';

        // do_* actions can set this to switch into a new mode after the action (see switch_to_mode()).
        this.new_mode = null;

        // do_* actions can set this to update the document state.
        this.new_document = null;
        
        this.files_changed = false;
        this.file_saved = false;

        // If set, this will be displayed as a transient notification in
        // the stack area.  Cleared after every keypress.
        this.notification_text = null;

        // Special indicator to help control the undo stack:
        //    null - save state to undo stack after this action as normal
        //    'undo' - request an undo
        //    'redo' - request a redo of saved undo states
        //    'suppress' - perform action as normal, but don't save state to the undo state
        //                 (used for 'minor' actions that don't warrant undo tracking)
        //    'clear' - undo stack will be reset (e.g. when loading a new document)
        this.perform_undo_or_redo = null;

        // Current prefix argument for commands like Swap; can be one of:
        //   null - no current prefix argument
        //   >= 1 - normal prefix argument
        //   -1   - "all" prefix argument (apply to all available items)
        // Prefix arguments are cleared after any normal command is executed
        // or if there's an error.  "Normal" command means anything that's not
        // another prefix argument key.
        this.prefix_argument = null;

        // do_* actions can set this to true to keep the prefix_argument from being reset after the action.
        this.preserve_prefix_argument = false;

        // If non-null, text-entry mode is active and the entry line will appear at the
        // bottom of the stack panel.  this.text_entry will be a TextEntryState object.
        this.text_entry = null;

        // Tracks multi-part custom_delimiters commands.
        this.custom_delimiters = {};

        // When in "dissect" mode, this is a specialized DissectUndoStack
        // that only tracks modifications to the stack top item being edited.
        this.dissect_undo_stack = null;
    }

    // Returns [was_handled, new_app_state]
    // NOTE: was_handled just indicates that a keybinding was found; it doesn't necessarily mean
    // that the command succeeded without error.
    handle_key(app_state, key) {
        if(key === 'Shift' || key === 'Alt' || key === 'Control')
            return [false, app_state];

        // If the popup panel is active, always use its dedicated keymap.
        const effective_mode = this.settings.popup_mode || this.mode;
        const command = this.settings.current_keymap.lookup_binding(effective_mode, key);
        if(command) {
            this.last_keypress = key;
            const new_app_state = this.process_command(command, app_state);
            return [true, new_app_state || app_state];
        }
        else
            return [false, app_state];
    }

    // Returns the new AppState, or null if anything failed.
    process_command(command, app_state) {
        // Command strings are of the form:
        //   'piece1;piece2;piece3'
        // where the pieces are subcommands to be executed as a batch.
        // Each piece in turn is a space-separated list where the first item
        // is the command name and the remainder are arguments to the command.
        // To put a literal semicolon into a command, write out 'semicolon'.
        const commands = command.split(';').map(
            piece => piece.split(' ').map(
                token => token.replaceAll('semicolon', ';')));
        return this.process_command_batch(commands, app_state);
    }

    // Process a batch of commands as a unit, returning the new AppState (or null if any of them failed).
    // Each command is of the form [command_name, param1, param2, ...]
    process_command_batch(commands, app_state) {
        this.perform_undo_or_redo = null;
        for(let i = 0; i < commands.length; i++) {
            const [command_name, ...parameters] = commands[i];
            const handler_function = this['do_' + command_name];
            if(!handler_function)
                return null;
            try {
                // Set up context variables for the handler functions to use:
                this.app_state = app_state;

                // TODO: maybe have this.changed.mode, this.changed.document etc.

                // Watch to see if the handler sets new_mode.  If it does, switch to that
                // mode after the command is finished, but otherwise switch back to base mode.
                this.new_mode = null;

                // The handler function will set this if the document changes.
                // (Stack changes are expected to be returned by the handler function.)
                this.new_document = null;

                // Likewise this will be set to true if anything changed about the file list / file selection.
                this.files_changed = false;  // TODO: rename -> selected_file_changed

                // This will be set to true if the current file was saved by this action.
                // This indicates that the app state's dirty flag should be cleared.
                this.file_saved = false;

                // If this is set to true, the prefix_argument will be kept as it as (otherwise it's reset to
                // null after each action).
                this.preserve_prefix_argument = false;

                this.notification_text = null;

                // Execute the handler and assemble the new state.
                const new_stack = (handler_function.bind(this))(app_state.stack, ...parameters);
                let new_app_state = new AppState(
                    new_stack || app_state.stack,
                    this.new_document || app_state.document
                );
                new_app_state.is_dirty = app_state.is_dirty || !new_app_state.same_as(app_state);
                if(this.file_saved)  // Current file was saved; explicitly clear the dirty flag.
                    new_app_state.is_dirty = false;
                app_state = new_app_state;

                // Switch back into base mode if the mode was not explicitly set by the handler.
                this.mode = this.new_mode || 'base';

                // Clear the prefix argument if the last command was not explicitly 'prefix_argument'.
                if(!this.preserve_prefix_argument)
                    this.prefix_argument = null;
            } catch(e) {
                if(e.message === 'stack_underflow' || e.message === 'stack_type_error' ||
                   e.message === 'prefix_argument_required') {
                    this.error_flash_stack();
                    this.perform_undo_or_redo = null;
                    this.mode = 'base';
                    this.prefix_argument = null;
                    return null;
                }
                else throw e;
            }
            finally {
                // Avoid holding references longer than needed.
                this.app_state = null;
                this.new_document = null;
            }
        }
        return app_state;
    }

    switch_to_mode(new_mode) {
        this.new_mode = new_mode;
    }

    error_flash_element(dom_element) {
        dom_element.classList.remove('errorflash');
        // eslint-disable-next-line no-unused-expressions
        dom_element.offsetWidth;  // force reflow
        dom_element.classList.add('errorflash');
    }

    error_flash_stack() {
        if(this.settings.layout.stack_split === 0)
            return this.error_flash_document();
        else
            return this.error_flash_element(document.getElementById('stack_panel'));
    }

    error_flash_document() {
        if(this.settings.layout.stack_split === 100)
            return this.error_flash_stack();
        else
            return this.error_flash_element(document.getElementById('document_panel'));
    }

    clear_all_flashes() {
	['stack_panel', 'document_panel'].forEach(elt_id =>
	    document.getElementById(elt_id).classList.remove('errorflash'));
    }

    notify(text) { this.notification_text = text; }

    // If the base already has a subscript, and is_superscript is true, the superscript
    // is placed into the existing base.  Otherwise, a new subscript/superscript node
    // is created.  A similar rule applies if is_superscript is false.
    _build_subscript_superscript(base_expr, child_expr, is_superscript) {
        // Check to see if we can slot the child into an empty sub/superscript "slot".
        if(base_expr.expr_type() === 'subscriptsuperscript' &&
           ((base_expr.subscript_expr === null && !is_superscript) ||
            (base_expr.superscript_expr === null && is_superscript))) {
            // There's "room" for it in this expr.
            return new SubscriptSuperscriptExpr(
                base_expr.base_expr,
                (is_superscript ? base_expr.subscript_expr : child_expr),
                (is_superscript ? child_expr : base_expr.superscript_expr));
        }
        else {
            // Create a new expr instead.  The base will be parenthesized if
            // it's a low-precedence infix expression.
            base_expr = DelimiterExpr.autoparenthesize(base_expr);
            // This will automatically parenthesize fractions like x/y -> (x/y)^2.
            // This line can be removed if this becomes undesired behavior.
            base_expr = DelimiterExpr.autoparenthesize_frac(base_expr);
            return new SubscriptSuperscriptExpr(
                base_expr,
                (is_superscript ? null : child_expr),
                (is_superscript ? child_expr : null));
        }
    }

    // Second-to-top stack item becomes the base, while the stack top becomes the
    // subscript or superscript depending on 'is_superscript'.
    make_subscript_superscript(stack, is_superscript) {
        const [new_stack, base_expr, child_expr] = stack.pop_exprs(2);
        const new_expr = this._build_subscript_superscript(
            base_expr, child_expr, is_superscript);
        return new_stack.push_expr(new_expr);
    }

    do_subscript(stack) { return this.make_subscript_superscript(stack, false); }
    do_superscript(stack) { return this.make_subscript_superscript(stack, true); }

    // Add a \prime to the stack top; this is almost like do_superscript with \prime
    // but needs some special handling to coalesce multiple \prime into a single superscript.
    do_prime(stack) {
        const [new_stack, base_expr] = stack.pop_exprs(1);
        const new_prime_expr = new CommandExpr('prime', []);
        // Check whether the base expr is already of the form x^{\prime}, x^{\prime\prime}, etc.
        // If so, add an extra \prime into the superscript.
        if(base_expr.expr_type() === 'subscriptsuperscript' && base_expr.superscript_expr) {
            const s = base_expr.superscript_expr;
            const is_prime_command = expr =>
                  expr.expr_type() === 'command' &&
                  expr.operand_count() === 0 && expr.command_name === 'prime';
            let new_superscript_expr;
            if(is_prime_command(s))
                new_superscript_expr = new SequenceExpr([s, new_prime_expr]);
            else if(s.expr_type() === 'sequence' && s.exprs.every(is_prime_command))
                new_superscript_expr = new SequenceExpr(s.exprs.concat([new_prime_expr]));
            else
                new_superscript_expr = null;
            if(new_superscript_expr) {
                const new_expr = new SubscriptSuperscriptExpr(
                    base_expr.base_expr, base_expr.subscript_expr, new_superscript_expr);
                return new_stack.push_expr(new_expr);
            }
        }
        // Otherwise, adding a prime works just like adding a \prime superscript.
        const new_expr = this._build_subscript_superscript(base_expr, new_prime_expr, true);
        return new_stack.push_expr(new_expr);
    }

    do_mode(stack, new_mode) { this.switch_to_mode(new_mode); }

    do_undo() { this.perform_undo_or_redo = 'undo'; }
    do_redo() { this.perform_undo_or_redo = 'redo'; }

    do_prefix_argument() {
        const key = this.last_keypress;
        this.perform_undo_or_redo = 'suppress';
        this.switch_to_mode(this.mode);
        this.preserve_prefix_argument = true;
        let new_prefix_argument = null;
        if(/^[0-9]$/.test(key)) {
            const value = parseInt(key);
            if(this.prefix_argument !== null && this.prefix_argument > 0) {
                // Multi-digit prefix argument
                new_prefix_argument = 10*this.prefix_argument + value;
            }
            else new_prefix_argument = value;
        }
        else if(key === '*')
            new_prefix_argument = -1;
        this.prefix_argument = new_prefix_argument;
    }

    // Convenience function for interpreting the prefix_argument in commands that support it.
    _get_prefix_argument(default_value, all_value) {
        if(this.prefix_argument === null)
            return default_value;
        else if(this.prefix_argument < 0)
            return all_value;
        else
            return this.prefix_argument;
    }

    // A nonzero prefix argument is required.
    // star_ok means that a prefix argument of * is acceptable (defaults to false).
    _require_prefix_argument(star_ok) {
        if(this.prefix_argument === null ||
	   (star_ok && this.prefix_argument === 0) ||
	   (!star_ok && this.prefix_argument <= 0))
            throw new Error('prefix_argument_required');
        else
            return this.prefix_argument;
    }

    // Duplicate the top N stack items (default=1).
    do_dup(stack) {
        const arg = this._get_prefix_argument(1, stack.depth());
        const [new_stack, ...items] = stack.pop(arg);
        const new_items = items.map(item => item.clone());  // keep item serial_numbers unique
        return new_stack.push_all(items.concat(new_items));
    }

    // Drop the top N stack items (default=1).
    do_pop(stack) {
        const arg = this._get_prefix_argument(1, stack.depth());
        // eslint-disable-next-line no-unused-vars
        const [new_stack, ...items] = stack.pop(arg);
        return new_stack;
    }

    // Drop the Nth stack item (default=2, i.e.: a b -> b)
    do_nip(stack) {
        const arg = this._get_prefix_argument(2, stack.depth());
        const [new_stack, ...items] = stack.pop(arg);
        return new_stack.push_all(items.slice(1));
    }

    // Reverse top N stack items (default=2)
    do_swap(stack) {
        const arg = this._get_prefix_argument(2, stack.depth());
        const [new_stack, ...items] = stack.pop(arg);
        items.reverse();
        return new_stack.push_all(items);
    }

    // Copy stack top above the current Nth stack item.
    // Default argument of 2 is: a b -> b a b
    // Argument of 1 acts as "dup".
    do_tuck(stack) {
        const arg = this._get_prefix_argument(2, stack.depth());
        const [new_stack, ...items] = stack.pop(arg);
        const last_item = items[items.length-1];
        return new_stack.push_all([last_item.clone()].concat(items));
    }

    // Pick the Nth item from the stack and copy it to the stack top.
    // Default argument of 2 is: a b -> a b a
    do_over(stack) {
        const arg = this._get_prefix_argument(2, stack.depth());
        const [new_stack, ...items] = stack.pop(arg);
        return new_stack.push_all(items.concat([items[0].clone()]));
    }

    // Rotate N top stack items (default=3: a b c -> b c a)
    do_rot(stack) {
        const arg = this._get_prefix_argument(3, stack.depth());
        const [new_stack, ...items] = stack.pop(arg);
        const new_items = items.slice(1).concat([items[0]]);
        return new_stack.push_all(new_items);
    }

    // Rotate N top stack items backwards (default=3: a b c -> c a b)
    do_unrot(stack) {
        const arg = this._get_prefix_argument(3, stack.depth());
        const [new_stack, ...items] = stack.pop(arg);
        const new_items = items.slice(-1).concat(items.slice(0, -1));
        return new_stack.push_all(new_items);
    }

    do_change_document_selection(stack, amount_string) {
        const amount = parseInt(amount_string);
        this.new_document = this.app_state.document.move_selection_by(amount);
        // this.perform_undo_or_redo = 'suppress';
    }

    do_shift_document_selection(stack, amount_string) {
        const amount = parseInt(amount_string);
        const new_document = this.app_state.document.shift_selection_by(amount);
        if(new_document)
            this.new_document = new_document;
        else
            this.error_flash_document();
    }

    do_save_file(stack) {
        const file_manager_state = this.app_component.state.file_manager_state;
        const filename = file_manager_state.current_filename;
        if(!filename)
            return this.do_save_file_as(stack);
        this.app_component.state.document_storage.save_state(
            this.app_state, filename,
            () => {
                this.notify('Saved: ' + filename);
                this.settings.last_opened_filename = filename;
                this.settings.save();
                this.perform_undo_or_redo = 'clear';
                this.app_component.request_file_list();
            },
            () => this.notify('Error saving:' + filename)
        );
        this.file_saved = true;
    }

    // TODO: factor with do_save_file
    do_save_file_as(stack) {
        let new_filename = window.prompt('Enter the filename to save as', this.settings.current_filename);
        if(!new_filename)
            return;
        let document_storage = this.app_component.state.document_storage;
        new_filename = document_storage.sanitize_filename(new_filename);
        document_storage.save_state(
            this.app_state, new_filename,
            () => {
                this.notify('Saved as: ' + new_filename);
                let file_manager_state = this.app_component.state.file_manager_state;
                file_manager_state.selected_filename = file_manager_state.current_filename = new_filename;
                this.settings.last_opened_filename = new_filename;
                this.settings.save();
                this.perform_undo_or_redo = 'clear';
                this.app_component.request_file_list();
            },
            () => this.notify('Error saving: ' + new_filename)
        );
        this.file_saved = true;
    }

    do_load_selected_file(stack) {
        const selected_filename = this.app_component.state.file_manager_state.selected_filename;
        if(!selected_filename)
            return this.error_flash_document();
        if(this.app_state.is_dirty) {
            if(window.confirm("The current document has been modified.  Save it now?")) {
                // Abort actually loading the new file; otherwise a
                // race condition between save and load is created due
                // to document_storage calls being asynchronous.  This
                // could be worked around by chaining the load after
                // the save but this is the only place it's a problem.
                return this.do_save_file(stack);
            }
        }
        this.app_component.start_loading_filename(selected_filename);
    }

    do_start_new_file(stack) {
        let file_manager_state = this.app_component.state.file_manager_state;
        let document_storage = this.app_component.state.document_storage;
        let new_filename = file_manager_state.generate_unused_filename(file_manager_state.current_filename || 'untitled');
        new_filename = window.prompt('Enter a filename for the new document', new_filename);
        if(!new_filename) return;
        new_filename = document_storage.sanitize_filename(new_filename || '');
        if(!new_filename) {
            alert('Invalid filename (must only contain letters, numbers and underscores)');
            return;
        }

        // Save the current document if needed first.
        if(file_manager_state.current_filename) {
            // NOTE: don't put up the notification flash here, unlike with an explicit save_document.
            document_storage.save_state(this.app_state, file_manager_state.current_filename);
        }

        // This basically works like loading from a blank file.
        let new_state = new AppState();
        this.new_document = new_state.document;
        file_manager_state.selected_filename = file_manager_state.current_filename = new_filename;
        this.settings.last_opened_filename = new_filename;
        this.settings.save();
        this.perform_undo_or_redo = 'clear';
        this.notify('Started new file: ' + new_filename);
        this.files_changed = true;
        this.file_saved = true;
        this.do_toggle_popup(new_state.stack, 'files');  // close file manager
        return new_state.stack;
    }

    do_select_adjacent_file(stack, offset_string) {
        const offset = parseInt(offset_string);
        let file_manager_state = this.app_component.state.file_manager_state;
        const new_filename = file_manager_state.find_adjacent_filename(file_manager_state.selected_filename, offset);
        if(new_filename) {
            file_manager_state.selected_filename = new_filename;
            this.files_changed = true;
        }
    }

    do_delete_selected_file(stack) {
        let file_manager_state = this.app_component.state.file_manager_state;
        let document_storage = this.app_component.state.document_storage;
        const filename = file_manager_state.selected_filename;
        if(!filename) return this.error_flash_document();
        if(!window.confirm("Really delete \"" + filename + "\"?")) return;
        document_storage.delete_state(
            filename,
            () => {
                this.notify('Deleted: ' + filename);
                const new_filename = file_manager_state.find_adjacent_filename(filename, 1);
                // TODO: might need this.files_changed = true
                file_manager_state.selected_filename = new_filename;
                this.settings.last_opened_filename = new_filename;
                this.settings.save();
                this.app_component.request_file_list();
            },
            () => this.notify('Error deleting: ' + filename)
        );
    }

    // If 'preserve' is set, items are kept on the stack after copying them
    // into the document.  Otherwise, the items are removed from the stack.
    do_pop_to_document(stack, preserve) {
        const arg = this._get_prefix_argument(1, stack.depth());
        const [new_stack, ...items] = stack.pop(arg);
        let new_document = this.app_state.document;
        for(let n = 0; n < items.length; n++)
            new_document = new_document.insert_item(items[n].clone());
        this.new_document = new_document;
        return preserve ? new_stack.push_all(items) : new_stack;
    }

    do_extract_from_document(stack, preserve) {
        const arg = this._get_prefix_argument(1, this.app_state.document.items.length);
        if(arg <= 0) return stack;
        let new_document = this.app_state.document;
        // Make sure there are enough items above the current document selection to extract.
        if(new_document.selection_index < arg)
            return this.error_flash_document();
        let new_items = [];
        for(let n = 0; n < arg; n++) {
            const item = new_document.selected_item();
            new_document = new_document.delete_selection();
            new_items.push(item.clone());
        }
        new_items.reverse();
        if(!preserve)
            this.new_document = new_document;
        return stack.push_all(new_items);
    }

    // Clear stack and document.
    do_reset_all(stack) {
        this.notify("Stack and document cleared");
        this.new_document = new Document([], 0);
        return new Stack([]);
    }

    do_push_separator(stack) {
	// See TextItem.is_empty() comment
	return stack.push(TextItem.empty_item());
    }

    do_push(stack, text) {
        text = text || '';  // handle 'push nothing' case
        return stack.push_expr(Expr.text_or_command(text));
    }

    do_self_push(stack) {
        return this.do_push(stack, this.last_keypress);
    }

    do_push_placeholder(stack) {
        return stack.push_expr(new PlaceholderExpr());
    }

    // Used for \mathscr / \mathcal, which only have uppercase glyphs.
    // case_type: 'uppercase', 'lowercase'
    // Stack top should be an ExprItem with a simple TextExpr.
    do_to_case(stack, case_type) {
        const convert_fn = string => {
            switch(case_type) {
            case 'uppercase': return string.toUpperCase();
            case 'lowercase': return string.toLowerCase();
            default: return string;
            }
        };
        const [new_stack, expr] = stack.pop_exprs(1);
        let new_expr;
        if(expr.expr_type() === 'text')
            new_expr = new TextExpr(convert_fn(expr.text));
        else
            new_expr = expr;
        return new_stack.push_expr(new_expr);
    }

    // Pop arity_string items (default 1) and turn them into an Command expr.
    do_operator(stack, opname, arity_string = '1') {
        const arity = parseInt(arity_string);
        const [new_stack, ...popped_exprs] = stack.pop_exprs(arity);
        const result_expr = new CommandExpr(opname, popped_exprs)
        return new_stack.push_expr(result_expr);
    }

    // Like do_operator, but if the stack item is already wrapped in a \boldsymbol or \pmb,
    // unwrap it and re-wrap the font face command inside \pmb.
    // e.g. \boldsymbol{A} -> \pmb{A}
    // See also do_make_roman(), which is a special case because \bold{} creates Roman
    // bold text without needing \pmb.
    do_font_operator(stack, facename) {
        const [new_stack, expr] = stack.pop_exprs(1);
        let new_expr = null;
        if(expr.expr_type() === 'command' && expr.operand_count() === 1 &&
           (expr.command_name === 'boldsymbol' || expr.command_name === 'pmb'))
            new_expr = new CommandExpr(
                'pmb', [new CommandExpr(facename, [expr.operand_exprs[0]])]);
        else if(expr.expr_type() === 'command' && expr.operand_count() === 1 &&
                expr.command_name === facename) {
            // Special case: don't wrap in the same typeface twice consecutively
            // (don't create \mathtt{\mathtt{A}}).  This check should probably be
            // generalized to strip existing typeface commands but there's not a good
            // way to do this cleanly yet.
            new_expr = expr;
        }
        else
            new_expr = new CommandExpr(facename, [expr]);
        return new_stack.push_expr(new_expr);
    }

    // \sin{x} etc.  Works similarly to do_operator except the argument is autoparenthesized.
    // If superscript_text is given, the text is applied as a superscript to the function
    // itself (not to the argument).
    // NOTE: if superscript_text starts with '_', it's treated as a subscript instead.
    do_named_function(stack, funcname, superscript_text) {
        let [new_stack, arg_expr] = stack.pop_exprs(1);
        const orig_funcname = funcname;
        if(superscript_text !== undefined) {
            // \sin^2{arg} etc.  This is a little awkward because the "head" of the command (\sin^2) is
            // no longer a simple LaTeX command like other CommandExprs.  Fortunately, things work out fine
            // treating it as such by just textually concatenating the superscript (putting in explicit braces
            // if necessary).  For example: "sin^2" or "sin^{-1}".
            let sup_or_sub = '^';
            if(superscript_text.startsWith('_')) {
                sup_or_sub = '_';
                superscript_text = superscript_text.slice(1);
            }
            if(superscript_text.length > 1)
                superscript_text = ['{', superscript_text, '}'].join('');
            funcname = [funcname, sup_or_sub, superscript_text].join('');
        }
        arg_expr = DelimiterExpr.autoparenthesize(arg_expr);

        // \sech and \csch are are missing in LaTeX for some reason so they need to be special cased here.
        let expr;
        if(orig_funcname === 'sech' || orig_funcname === 'csch')
            expr = new CommandExpr('operatorname', [new TextExpr(funcname), arg_expr]);
        else
            expr = new CommandExpr(funcname, [arg_expr]);

        return new_stack.push_expr(expr);
    }

    // opname == 'argmax': y x -> \argmax\limits_{x} y
    // If make_operatorname is true, opname is not a built-in LaTeX operator
    // but is instead wrapped in an \operatorname{} to simulate it.
    do_underset_operator(stack, opname, make_operatorname) {
        const [new_stack, argument_expr, sub_expr] = stack.pop_exprs(2);
        let command_expr;
        if(make_operatorname)
            command_expr = new CommandExpr('operatorname', [new TextExpr(opname)]);
        else
            command_expr = new CommandExpr(opname);
        const limits_expr = new SubscriptSuperscriptExpr(
            new CommandExpr('limits'), sub_expr);
        const new_expr = Expr.combine_pair(
            Expr.combine_pair(command_expr, limits_expr),
            argument_expr);
        return new_stack.push_expr(new_expr);
    }

    // Same as do_operator, except if the object the hat is being added to is a literal 'i' or 'j',
    // or bolded i/j, it's first converted into a \imath or \jmath to remove the dot.
    do_apply_hat(stack, hat_op) {
        let [new_stack, expr] = stack.pop_exprs(1);
        if(expr.expr_type() === 'text' &&
           (expr.text === 'i' || expr.text === 'j'))
            expr = new CommandExpr(expr.text === 'i' ? 'imath' : 'jmath');
        else if(expr.expr_type() === 'command' && expr.operand_count() === 1 &&
                (expr.command_name === 'boldsymbol' || expr.command_name === 'mathbf')) {
            // Check for bolded literal i/j
            const inner_expr = expr.operand_exprs[0];
            if(inner_expr.expr_type() === 'text' &&
               (inner_expr.text === 'i' || inner_expr.text === 'j'))
                expr = new CommandExpr(
                    expr.command_name,
                    [new CommandExpr(inner_expr.text === 'i' ? 'imath' : 'jmath')]);
        }
        const result_expr = new CommandExpr(hat_op, [expr]);
        return new_stack.push_expr(result_expr);
    }

    // Wrap expr in \htmlClass{...}
    // If it's already wrapped in the given class, unwrap it instead.
    // If class_name_2 is also provided, this cycles between:
    //    nothing -> class_name -> class_name_2 -> nothing
    do_html_class(stack, class_name, class_name_2) {
        let [new_stack, expr] = stack.pop_exprs(1);
        let new_class_name = null;
        if(expr.expr_type() === 'command' &&
           expr.command_name === 'htmlClass' &&
           expr.operand_count() === 2 &&
           expr.operand_exprs[0].expr_type() === 'text') {
            // It's already wrapped in \htmlClass
            if(expr.operand_exprs[0].text === class_name)
                new_class_name = class_name_2;  // might be null
            expr = expr.operand_exprs[1];  // Strip existing \htmlClass
        }
        else
            new_class_name = class_name;
        if(new_class_name)
            expr = new CommandExpr('htmlClass', [new TextExpr(new_class_name), expr]);
        return new_stack.push_expr(expr);
    }

    // For ExprItems, this just wraps the expression in \boldsymbol (if it's not already wrapped).
    // For TextItems, the individual components of the text are bolded.
    do_make_bold(stack) {
        const [new_stack, item] = stack.pop(1);
        return new_stack.push(item.as_bold());
    }

    // This is equivalent to 'operator mathrm' except that if the target is already wrapped in a \boldsymbol{}
    // (presumably created by do_make_bold()), this converts it into a \bold{} which yields a bold Roman glyph.
    do_make_roman(stack) {
        const [new_stack, expr] = stack.pop_exprs(1);
        let new_expr = null;
        if(expr.expr_type() === 'command' && expr.command_name === 'boldsymbol' && expr.operand_count() === 1)
            new_expr = new CommandExpr('bold', expr.operand_exprs);
        else if(expr.expr_type() === 'command' && expr.command_name === 'mathrm')
            new_expr = expr;
        else
            new_expr = new CommandExpr('mathrm', [expr]);
        return new_stack.push_expr(new_expr);
    }

    do_custom_delimiter(stack, delimiter_type) {
        this.switch_to_mode('custom_delimiters');
        if(!delimiter_type) {
            // Start new sequence
            this.custom_delimiters = {};
            this.preserve_prefix_argument = true;
            return;
        }
        if(!this.custom_delimiters.left) {
            // First delimiter (left side)
            this.custom_delimiters.left = delimiter_type;
            this.preserve_prefix_argument = true;
            return;
        }
        if(!this.custom_delimiters.right) {
            // Second delimiter (right side)
            this.custom_delimiters.right = delimiter_type;
            if(this.prefix_argument === null || this.prefix_argument <= 1)
                return this._finish_custom_delimiters(stack);
            else {
                // Prefix argument of 2 or more has been entered; wait for 3rd delimiter.
                this.preserve_prefix_argument = true;
                return;
            }
        }
        // Third delimiter (middle)
        this.custom_delimiters.middle = delimiter_type;
        return this._finish_custom_delimiters(stack);
    }

    _finish_custom_delimiters(stack) {
        this.switch_to_mode('base');
        const d = this.custom_delimiters;
        let arity = this.prefix_argument || 1;
        if(arity < 1) arity = 1;
        const [new_stack, ...exprs] = stack.pop_exprs(arity);
        const new_expr = new DelimiterExpr(d.left, d.right, d.middle, exprs);
        this.custom_delimiters = {};
        return new_stack.push_expr(new_expr);
    }

    do_toggle_fixed_size_delimiters(stack) {
	const [new_stack, expr] = stack.pop_exprs(1);
	if(expr.expr_type() === 'delimiter')
	    return new_stack.push_expr(expr.as_fixed_size(!expr.fixed_size));
	else
	    stack.type_error();
    }

    do_remove_delimiters(stack) {
	const [new_stack, expr] = stack.pop_exprs(1);
	if(expr.expr_type() === 'delimiter')
            return new_stack.push_expr(expr.without_delimiters());
        else
            return stack;  // not considered an error
    }

    // opname can be either a \latex_command or a regular string like '+'
    // The cases of Expr+Expr and Expr+Text (or Text+Text) are handled separately.
    do_infix(stack, opname) {
        const [new_stack, left_item, right_item] = stack.pop(2);
        const left_type = left_item.item_type(), right_type = right_item.item_type();
        if(left_type === 'expr' && right_type === 'expr') {
            // Expr+Expr (the usual case).
            let operator_expr = Expr.text_or_command(opname);
            const new_expr = InfixExpr.combine_infix(
                left_item.expr, right_item.expr, operator_expr);
            return new_stack.push_expr(new_expr);
        }
        else if((left_type === 'expr' || left_type === 'text') &&
                (right_type === 'expr' || right_type === 'text')) {
            // Expr+Text or Text+Expr or Text+Text.
            const new_item = TextItem.concatenate_items(left_item, right_item, opname);
            return new_stack.push(new_item);
        }
        else
            return stack.type_error();
    }

    // Similar to do_infix but joins two expressions with an English phrase
    // with Roman font and extra spacing (\quad).
    do_conjunction(stack, phrase) {
        const [new_stack, left_item, right_item] = stack.pop(2);
        const left_type = left_item.item_type(), right_type = right_item.item_type();
        if(left_type === 'expr' && right_type === 'expr') {
            // Expr+Expr
            const operator_expr = new SequenceExpr([
                new CommandExpr('quad'),
                new CommandExpr('text', [new TextExpr(phrase.replaceAll('_', ' '))]),
                new CommandExpr('quad')]);
            return new_stack.push_expr(
                InfixExpr.combine_infix(
                    left_item.expr, right_item.expr, operator_expr));
        }
        else if((left_type === 'expr' || left_type === 'text') &&
                (right_type === 'expr' || right_type === 'text')) {
            // Expr+Text or Text+Expr or Text+Text
            const conjunction_item = TextItem.from_string(' ' + phrase + ' ');
            const new_item = TextItem.concatenate_items(
                left_item, TextItem.concatenate_items(conjunction_item, right_item));
            return new_stack.push(new_item);
        }
        else
            return stack.type_error();
    }

    do_split_infix(stack) {
        const [new_stack, infix_expr] = stack.pop_exprs(1);
        if(infix_expr.expr_type() !== 'infix') {
            this.error_flash_stack();
            return;
        }
        const split_type = infix_expr.split_type;
        let new_split_type = null;
        if(split_type === 'after') new_split_type = 'before';
        else if(split_type === 'before') new_split_type = null;
        else new_split_type = 'after';
        const new_infix_expr = infix_expr.with_split_at(
            infix_expr.split_at_index,
	    new_split_type);
        return new_stack.push_expr(new_infix_expr);
    }

    // Swap left and right sides of an "infix" expression, which can be an
    // actual InfixExpr or else a DelimiterExpr that has 2 inner expressions,
    // e.g. <x | y> or \left. x \middle/ y \right.
    // For InfixExpr, the "pivot" operator for the swap is taken from split_at_index,
    // which is generally the most recently-used operator in the creation of the
    // infix expression.
    do_swap_infix(stack) {
	const [new_stack, expr] = stack.pop_exprs(1);
	let new_expr = null;
	if(expr.expr_type() === 'infix')
            new_expr = expr.swap_sides_at(expr.split_at_index);
	else if(expr.expr_type() === 'delimiter' &&
		expr.inner_exprs.length === 2)
	    new_expr = new DelimiterExpr(
		expr.left_type, expr.right_type, expr.middle_type,
		[expr.inner_exprs[1], expr.inner_exprs[0]],
		expr.fixed_size);
	if(new_expr)
	    return new_stack.push_expr(new_expr);
	else
	    return this.error_flash_stack();
    }

    do_cancel() {}

    do_concat(stack) {
        let [new_stack, left_item, right_item] = stack.pop(2);
        const left_type = left_item.item_type(), right_type = right_item.item_type();
        if(left_type === 'expr' && right_type === 'expr') {
            let left_expr = left_item.expr, right_expr = right_item.expr;
            const new_expr = Expr.combine_pair(left_expr, right_expr);
            return new_stack.push_expr(new_expr);
        }
        else if((left_type === 'expr' || left_type === 'text') &&
                (right_type === 'expr' || right_type === 'text')) {
            const new_item = TextItem.concatenate_items(left_item, right_item);
            return new_stack.push(new_item);
        }
        else
            return stack.type_error();
    }

    // "Fuse" two expressions into a uncombinable SequenceExpr.
    // This is used to create things like f(x) where it is to be treated
    // as a unit and not merged into adjacent SequenceExprs.
    // (This matters for purposes of selecting subexpressions in 'dissect' mode).
    do_fuse(stack) {
	const [new_stack, left_expr, right_expr] = stack.pop_exprs(2);
	const new_expr = new SequenceExpr([left_expr, right_expr], true);
	return new_stack.push_expr(new_expr);
    }

    // Substitute the stack top expression into the first available placeholder marker in the
    // item second from top.  That item can be either an ExprItem or TextItem.
    do_substitute_placeholder(stack) {
        const [new_stack, substitution_expr] = stack.pop_exprs(1);
        const [new_stack_2, item] = new_stack.pop(1);
        if(item.item_type() === 'expr') {
            const original_expr = item.expr;
            const placeholder_expr = original_expr.find_placeholder();
            if(placeholder_expr) {
                const new_expr = original_expr.substitute_expr(placeholder_expr, substitution_expr);
                return new_stack_2.push_expr(new_expr);
            }
        }
        else if(item.item_type() === 'text') {
            const new_text_item = item.try_substitute_placeholder(substitution_expr);
            if(new_text_item)
                return new_stack_2.push(new_text_item);
        }
        return stack.type_error();
    }

    // Extract either the left or right side of an InfixExpr
    // (or a DelimiterExpr with 2 inner expressions; cf. do_swap_infix).
    do_extract_infix_side(stack, which_side) {
        const [new_stack, expr] = stack.pop_exprs(1);
	let extracted_expr = null;
	if(expr.expr_type() === 'infix')
	    extracted_expr = expr.extract_side_at(expr.split_at_index, which_side);
	else if(expr.expr_type() === 'delimiter' &&
		expr.inner_exprs.length === 2)
	    extracted_expr = (which_side === 'right') ? expr.inner_exprs[1] : expr.inner_exprs[0];
        else
            return stack.type_error();
        return new_stack.push_expr(extracted_expr);
    }

    do_start_text_entry(stack, text_entry_mode, initial_text) {
        this.text_entry = new TextEntryState(text_entry_mode, initial_text);
        this.switch_to_mode(text_entry_mode);
        this.perform_undo_or_redo = 'suppress';
        return stack;
    }

    do_cancel_text_entry(stack) {
        this.perform_undo_or_redo = 'suppress';
        return this.cancel_text_entry(stack);
    }

    cancel_text_entry(stack) {
        const edited_item = this.text_entry.edited_item;
        this.text_entry = null;
        if(edited_item)
            return stack.push(edited_item);
        else
            return stack;
    }

    do_text_entry_move_cursor(stack, move_type) {
        this.perform_undo_or_redo = 'suppress';
        this.switch_to_mode(this.mode);
        this.text_entry.move(move_type);
        return stack;
    }

    do_append_text_entry(stack) {
        const key = this.last_keypress;
        this.perform_undo_or_redo = 'suppress';
        this.switch_to_mode(this.mode);
        if(key.length === 1) {
            if(this.text_entry.mode === 'latex_entry') {
                // Disallow characters that are invalid as part of a LaTeX command.
                // Technically, commands like \$ should be allowed here, but those are all
                // accessible by their own keybindings already.  So only alphabetic characters
                // are allowed in latex entry mode.
                if(!/^[a-zA-Z]$/.test(key))
                    return this.error_flash_stack();
            }
            this.text_entry.insert(key);
        }
        return stack;
    }

    // If new_mode_when_empty is provided, switch to that mode if this
    // backspace was done while the text field is empty.  This is currently
    // used to switch back from latex entry mode to normal math entry mode.
    do_backspace_text_entry(stack, new_mode_when_empty) {
        if(this.text_entry.is_empty()) {
            // Everything has been deleted; cancel text entry.
	    // Note that when cancelling via backspace this way, even if
	    // there was a text_entry_edited_item, it's discarded.
            this.cancel_text_entry(stack);
            if(new_mode_when_empty) {
                this.text_entry = new TextEntryState(new_mode_when_empty, '');
                this.switch_to_mode(new_mode_when_empty);
            }
	    return stack;
        }
        else {
            this.text_entry.backspace();
            this.switch_to_mode(this.mode);
        }
        this.perform_undo_or_redo = 'suppress';
        return stack;
    }

    // textstyle determines what the entered text becomes:
    //   'math' - ExprItem with plain italic math text
    //   'roman_math' - ExprItem with \mathrm{...} text
    //   'latex' - ExprItem with arbitrary latex command
    //   'text' - TextItem
    //   'heading' - TextItem with is_heading flag set
    do_finish_text_entry(stack, textstyle) {
        if(!this.text_entry)
            return stack;  // shouldn't happen
        if(this.text_entry.is_empty())
            return this.cancel_text_entry(stack);
        if(textstyle === 'text' || textstyle === 'heading') {
            let item = TextItem.parse_string(this.text_entry.current_text);
            if(textstyle === 'heading') item.is_heading = true;
            this.cancel_text_entry(stack);
            return stack.push(item);
        }
        // math or roman_math or latex
        let new_expr;
        if(textstyle === 'roman_math') {
            new_expr = new CommandExpr('mathrm', [
                new TextExpr(this._latex_escape(this.text_entry.current_text))]);
        }
        else if(textstyle === 'latex') {
            // NOTE: do_append_text_entry should only allow alphabetic characters through,
            // so no real need to do sanitization here any more.
            
            // const sanitized = this.text_entry.replaceAll(/[^a-zA-Z]/g, '');
            // if(sanitized.length === 0) {
            //     this.text_entry = null;
            //     this.text_entry_mode = null;
            //     return stack;
            // }
            // new_expr = new CommandExpr(sanitized);

            new_expr = new CommandExpr(this.text_entry.current_text);
        }
        else
            new_expr = new TextExpr(
                this._latex_escape(this.text_entry.current_text));
        this.cancel_text_entry(stack);
        return stack.push_expr(new_expr);
    }

    // Start text entry mode using the item on the stack top.
    // Because the minieditor is so limited, only these cases are allowed:
    //   - TextItems without anything too "complicated" (see TextItem.as_editable_string);
    //     these will start with the minieditor in text-entry mode.
    //   - ExprItems that are only a simple CommandExpr with a no-argument LaTeX command;
    //     in this case the minieditor will start directly in LaTeX-entry mode.
    //   - ExprItems that represent a simple text string like '123' or 'xyz'.
    //   - ExprItems that represent \mathrm{x} where x is a simple string like '123' or 'xyz'
    //     (this is to allow expressions created via Shift+Enter in the minieditor to be editable).
    do_edit_item(stack) {
	const [new_stack, item] = stack.pop(1);
	if(item.item_type() === 'text') {
	    const s = item.as_editable_string();
	    if(s) {
		this.do_start_text_entry(new_stack, 'text_entry', s);
                this.text_entry.edited_item = item;
		return new_stack;
	    }
	}
	else if(item.item_type() === 'expr') {
	    let expr = item.expr;
	    if(expr.expr_type() === 'command' && expr.operand_count() === 0) {
		// LaTeX command with no arguments, e.g. \circledast
		this.do_start_text_entry(new_stack, 'latex_entry', expr.command_name);
                this.text_entry.edited_item = item;
		return new_stack;
	    }
	    // Try stripping off a single level of \mathrm{...} if there is one.
	    if(expr.expr_type() === 'command' && expr.operand_count() === 1 &&
	       expr.command_name === 'mathrm')
		expr = expr.operand_exprs[0];
	    // It's editable only if it's a basic TextExpr that doesn't start with a
	    // backslash (so generally, only something that was directly created by
	    // the minieditor to begin with).
	    if(expr.expr_type() === 'text' && !expr.text.startsWith("\\")) {
		this.do_start_text_entry(
		    new_stack,
		    'math_text_entry',
		    this._latex_unescape(expr.text));
                this.text_entry.edited_item = item;
		return new_stack;
	    }
	}
	return this.error_flash_stack();
    }

    // Dissect mode commands:
    //
    // When in 'dissect' mode, subexpressions of the stack top can be selected and
    // operated upon.  Changing the selection does not modify the actual Expr; instead
    // it generates new ExprItems with the updated 'selected_expr_path'.  This is a
    // property of the ExprItem, not the Expr, so dissect mode commands have to explicitly
    // manipulate the ExprItem instances (rather than using push_expr()).  This is
    // mostly abstracted into _do_dissect_operation() below.

    do_start_dissect_mode(stack) {
	const [new_stack, expr] = stack.pop_exprs(1);
	// The expression to be 'dissected' must have subexpressions or it's an error.
	if(expr.has_subexpressions()) {
	    this.switch_to_mode('dissect');
            this.perform_undo_or_redo = 'suppress';
            this.dissect_undo_stack = new DissectUndoStack(expr);
	    // Build a new ExprItem with a default initial selection.
	    return new_stack.push(new ExprItem(expr, null, new ExprPath(expr, [0])));
	}
	else
	    return this.error_flash_stack();
    }

    // Cancel any changes that have been done while in dissect mode
    // (i.e., undo as far as possible) and exit the mode.
    do_cancel_dissect_mode(stack) {
        // eslint-disable-next-line no-unused-vars
	const [new_stack, expr] = stack.pop_exprs(1);  // expr will be discarded
	this.perform_undo_or_redo = 'suppress';
        const original_expr = this.dissect_undo_stack.initial_expr;
        this.dissect_undo_stack = null;
	return new_stack.push(new ExprItem(original_expr, null, null));
    }

    // Accept any changes that have been done while in dissect mode
    // and exit the mode.
    // NOTE: Can't currently modify the active expression, so this is not needed yet.
    // If this is implemented, make sure that if the expression has not actually been
    // modified, undo is suppressed for this action.  Only log an undo if there has been
    // a change.
/*    do_finish_dissect_mode(stack) {
	const [new_stack, expr] = stack.pop_exprs(1);
        this.dissect_undo_stack = null;
        // A new ExprItem needs to be constructed in order to remove
        // the existing ExprPath selection.
	return new_stack.push(new ExprItem(expr, null, null));
      }     */

    // Undo last action while in dissect mode, if possible.
    // Cancel dissect mode if there are no undo states.
    do_dissect_undo(stack) {
        this.perform_undo_or_redo = 'suppress';
        let undo_stack = this.dissect_undo_stack;
        const new_expr_path = undo_stack.pop();
        if(new_expr_path) {
            // eslint-disable-next-line no-unused-vars
            const [new_stack, old_expr] = stack.pop_exprs(1);
            this.switch_to_mode('dissect');
            return new_stack.push(
                new ExprItem(new_expr_path.expr, null, new_expr_path));
        }
        else
            return this.do_cancel_dissect_mode(stack);
    }

    // Descend into a subexpression, if possible.
    // The new selection will point at the first (index=0) subexpression
    // of the current selection.
    do_dissect_descend(stack) {
	return this._do_dissect_operation(stack, expr_path => {
	    const subexpr = expr_path.selected_expr();
	    if(subexpr.has_subexpressions())
		return expr_path.descend(0);
	    else
		return expr_path;
	});
    }

    // Ascend to the parent of the current selection(s), if possible.
    do_dissect_ascend(stack) {
	return this._do_dissect_operation(stack, expr_path => {
	    // For consistency, do not allow ascending to the "top level" Expr
	    // (the one actually on the stack).  This would be technically OK, but
	    // of limited use and inconsistent with the usual UI (where we immediately
	    // select the first subexpression of the stack top upon starting dissect mode).
	    if(expr_path.depth() <= 1)
		return expr_path;
	    else
		return expr_path.ascend();
	});
    }

    // Move the selection left or right within its parent Expr.
    // If there is currently a multi-selection, it is cancelled and
    // "left" or "right" is taken relative to the original multi-selection.
    do_dissect_move_selection(stack, direction) {
	return this._do_dissect_operation(stack, expr_path =>
	    expr_path.move(direction));
    }

    // Replace the stack top with an "extracted" version where the selected
    // subexpression is replaced with a placeholder.  The extracted subexpression
    // is then put on the stack top, unless 'trim' is given, in which case only
    // the original expression with placeholder is left on the stack.
    // This command also exits dissect mode.
    do_dissect_extract_selection(stack, trim) {
	const [new_stack, item] = stack.pop(1);
	if(item.item_type() !== 'expr')
            stack.type_error();
	const expr_path = item.selected_expr_path;
	const expr_with_placeholder = expr_path.extract_selection();
	const extracted_expr = expr_path.selected_expr();
        this.dissect_undo_stack = null;  // exiting dissect mode
        if(trim === 'trim')
            return new_stack.push_expr(expr_with_placeholder);
        else
	    return new_stack.push_all_exprs([expr_with_placeholder, extracted_expr]);
    }

    // Same as do_dissect_extract_selection, but the original expression
    // is left unmodified (no placeholder replacement).
    // If 'trim' is given, the original expression is removed from the stack,
    // leaving only the selected subexpression.
    do_dissect_copy_selection(stack, trim) {
	const [new_stack, item] = stack.pop(1);
	if(item.item_type() !== 'expr')
            stack.type_error();
	const expr_path = item.selected_expr_path;
	const extracted_expr = expr_path.selected_expr();
        this.dissect_undo_stack = null;  // exiting dissect mode
        if(trim === 'trim')
            return new_stack.push_expr(extracted_expr);
        else
	    return new_stack.push_all_exprs([expr_path.expr, extracted_expr]);
    }

    // This abstracts out dissect mode operations.  The given function fn()
    // takes the existing ExprPath, and should return the new ExprPath,
    // or null if the operation is considered an error.
    _do_dissect_operation(stack, fn) {
	const [new_stack, item] = stack.pop(1);
	if(item.item_type() !== 'expr')
            stack.type_error();
	this.switch_to_mode(this.mode);
	const expr_path = item.selected_expr_path;
	const new_expr_path = fn(expr_path);
	if(new_expr_path) {
            // This mode has its own undo stack; normal undo is suppressed.
	    this.perform_undo_or_redo = 'suppress';
            this.dissect_undo_stack.push(expr_path);
	    const new_expr_item = new ExprItem(new_expr_path.expr, null, new_expr_path);
	    return new_stack.push(new_expr_item);
	}
	else
	    return this.error_flash_stack();
    }

    // TODO: may want to make this a general utility method, but it's only used here so far.
    _latex_escape(text) {
        const replacements = {
            ' ': "\\,",
            '_': "\\_",
            '^': "\\wedge ",
            '%': "\\%",
            "'": "\\rq ",
            "`": "\\lq ",
            '$': "\\$",
            '&': "\\&",
            '#': "\\#",
            '}': "\\}",
            '{': "\\{",
            '~': "\\sim ",
            "\\": "\\backslash "
        };
        return text.replaceAll(/[ _^%'`$&#}{~\\]/g, match => replacements[match]);
    }

    // Inverse of _latex_escape.  This is used by do_edit_item to allow simple TextExprs
    // to be editable again in the minieditor.
    _latex_unescape(text) {
	// TODO: figure out a better way of handling this so it doesn't repeat
	// what's in _latex_escape
        const replacements = {
            "\\,": ' ',
            "\\_": '_',
            "\\wedge ": '^',
            "\\%": '%',
            "\\rq ": "'",
            "\\lq ": "`",
            "\\$": '$',
            "\\&": '&',
            "\\#": '#',
            "\\}": '}',
            "\\{": '{',
            "\\sim ": '~',
            "\\backslash ": "\\"
        };
        return text.replaceAll(
	    /\\,|\\_|\\wedge |\\%|\\rq |\\lq |\\\$|\\&|\\#|\\\}|\\\{|\\sim |\\backslash /g,
	    match => replacements[match]);
    }

    do_toggle_is_heading(stack) {
        let [new_stack, item] = stack.pop(1);
        if(item.item_type() === 'expr') {
            // Implicitly turn ExprItems into TextItems.
            item = TextItem.from_expr(item.expr);
        }
        if(item.item_type() === 'text') {
	    // Special case: don't allow empty TextItems to be changed this way.
	    // See the comment in TextItem.is_empty().
	    if(item.is_empty())
		return this.error_flash_stack();
            item = item.clone();
            item.is_heading = !item.is_heading;
            return new_stack.push(item);
        }
        else
            this.error_flash_stack();
    }

    do_extract_latex_source(stack) {
        // eslint-disable-next-line no-unused-vars
	const [new_stack, expr] = stack.pop_exprs(1);
	const latex_source = expr.to_text();
	const code_item = new CodeItem('latex', latex_source);
	return stack.push(code_item);
    }

    // expr_count is the number of items to pop from the stack to put inside the delimiters.
    // It defaults to 1, but if it's 2 or more, 'middle' is used to separate each item within
    // the delimiters.
    do_delimiters(stack, left, right, middle, expr_count_string) {
        const expr_count = (expr_count_string === undefined) ? 1 : parseInt(expr_count_string);
        const [new_stack, ...inner_exprs] = stack.pop_exprs(expr_count);
        let new_expr = null;
        // Special case: if the stack top is already a DelimiterExpr with "blank" delimiters
        // we can just rebuild a new DelimiterExpr with the specified delimiters instead,
        // without wrapping it in another DelimiterExpr.
        if(expr_count === 1 && inner_exprs[0].expr_type() === 'delimiter' &&
           inner_exprs[0].left_type === '.' && inner_exprs[0].right_type === '.') {
            new_expr = new DelimiterExpr(
                left, right, inner_exprs[0].middle_type,
                inner_exprs[0].inner_exprs);
        }
        else {
            // The usual case.
            new_expr = new DelimiterExpr(
                left, right, middle, inner_exprs);
        }
        return new_stack.push_expr(new_expr);
    }

    // Wrap stack top in parentheses if it's not already in delimiters.
    do_parenthesize(stack) {
        let [new_stack, expr] = stack.pop_exprs(1);
        // Special case: \left. X \middle| \right. style delimiters
        // are treated as a kind of pseudo-infix expression here.
        // This is to make things like Pr(x | y) work better when | is a
        // flex-size delimiter.
        if(expr.expr_type() === 'delimiter' && expr.left_type === '.' &&
           expr.right_type === '.' && expr.inner_exprs.length > 1)
            expr = new DelimiterExpr('(', ')', expr.middle_type, expr.inner_exprs);
        else if(expr.expr_type() !== 'delimiter')
            expr = DelimiterExpr.parenthesize(expr);
        return new_stack.push_expr(expr);
    }

    // If expr_count_string is provided, exactly that many expressions from the stack
    // are autoparenthesized.  If any of them is not actually an ExprItem, nothing is done.
    do_autoparenthesize(stack, expr_count_string) {
        const expr_count = (expr_count_string === undefined) ? 1 : parseInt(expr_count_string);
        const [new_stack, ...items] = stack.pop(expr_count);
        if(items.every(item => item.item_type() === 'expr'))
            return new_stack.push_all_exprs(
                items.map(item => DelimiterExpr.autoparenthesize(item.expr)));
        else
            return stack;
    }

    // Combine command name and arguments from the stack into a CommandExpr.
    // \frac x y -> \frac{x}{y}
    do_apply_operator(stack, arg_count_string) {
        const arg_count = parseInt(arg_count_string);
        const [new_stack, command_expr, ...operand_exprs] = stack.pop_exprs(arg_count+1);
        if(command_expr.expr_type() === 'command' && command_expr.operand_count() === 0)
            return new_stack.push_expr(
                new CommandExpr(command_expr.command_name, operand_exprs));
        else
            this.error_flash_stack();
    }

    // Take (left, right, operator) from the stack and create an InfixExpr.
    // Special case: if 'operator' is \mathrm{...}, it's surrounded with \quad
    // spacers as in do_conjunction().
    do_apply_infix(stack) {
        let [new_stack, left_expr, right_expr, operator_expr] = stack.pop_exprs(3);
        if(operator_expr.expr_type() === 'command' &&
           operator_expr.command_name === 'mathrm' &&
           operator_expr.operand_count() === 1)
            operator_expr = new SequenceExpr([
                new CommandExpr('quad'), operator_expr, new CommandExpr('quad')]);
        const new_expr = InfixExpr.combine_infix(left_expr, right_expr, operator_expr);
        return new_stack.push_expr(new_expr);
    }

    do_toggle_popup(stack, mode_string) {
        // Hack: Save help panel scroll position so we can restore it next
        // time the help is displayed.  This isn't very good because browser
        // window/font resizings will throw it off.  Needs revisiting.
        // Maybe the help should be its own iframe.
        if(this.settings.popup_mode === 'help') {
            const elt = document.getElementById('popup_panel');
            if(elt && elt.scrollTop)
                this.settings.help_scroll_top = elt.scrollTop;
        }
        this.settings.popup_mode =
            (this.settings.popup_mode === mode_string) ? null : mode_string;
        this.settings.save();
        this.app_component.apply_layout_to_dom();
    }

    // Set various configuration options.
    do_config(stack, config_option, value) {
        let settings = this.settings;
        let layout = settings.layout;
        let full_refresh_needed = false;  // set to true if everything needs to be re-rendered afterwards
        let scratch;
        switch(config_option) {
        case 'zoom_factor':
            scratch = this._get_prefix_argument(1, -1);
            if(scratch < 0)
                layout.zoom_factor = 0;
            else if(value === 'decrease')
                layout.zoom_factor -= scratch;
            else
                layout.zoom_factor += scratch;
	    this.notify("Zoom level: " + (layout.zoom_factor > 0 ? "+" : "") + layout.zoom_factor);
            break;
        case 'math_align':
            if(value === 'toggle_document')
                layout.document_rightalign_math = !layout.document_rightalign_math;
            else if(value === 'toggle_stack')
                layout.stack_rightalign_math = !layout.stack_rightalign_math;
            break;
        case 'toggle_inline_math':
            layout.inline_math = !layout.inline_math;
            full_refresh_needed = true;
            break;
	case 'toggle_mode_indicator':
	    settings.show_mode_indicator = !settings.show_mode_indicator;
	    this.notify("Mode indicator " + (settings.show_mode_indicator ? "enabled" : "disabled"));
	    break;
        case 'stack_side':
            layout.stack_side = value;
            break;
        case 'stack_split':
            // prefix argument:
            //   none:    50% (undocumented)
            //   0..9:    0% to 90%
            //   *:       100%
            //   11..99:  11% to 99% (undocumented)
            scratch = this._get_prefix_argument(5, 10);
            if(scratch <= 10) scratch *= 10;
            if(scratch > 100) scratch = 100;
            layout.stack_split = scratch;
            break;
        case 'inverse_video':
            settings.inverse_video = !settings.inverse_video;
            break;
        case 'reset_layout':
            settings.layout = settings.default_layout();
            settings.inverse_video = false;
            settings.show_mode_indicator = true;
            full_refresh_needed = true;
            break;
        case 'reload_page':
            window.location.reload();
            break;
        default:
            break;
        }
        settings.save();
        this.perform_undo_or_redo = 'suppress';
        this.app_component.apply_layout_to_dom();
        this.clear_all_flashes();
        if(full_refresh_needed) {
            // All displayed ItemComponents need to be re-rendered.
            this.new_document = this.app_state.document.clone_all_items();
            return stack.clone_all_items();
        }
    }

    do_fullscreen(stack, on_or_off) {
        if(on_or_off === 'off')
            document.exitFullscreen();
        else
            document.getElementsByTagName('html')[0].requestFullscreen();
        this.perform_undo_or_redo = 'suppress';
        return stack;
    }

    // item1, item2, ... => [item1, item2, ...]
    // column_count is optional; if omitted, the prefix argument is used.
    do_build_matrix_row(stack, matrix_type, column_count) {
        const expr_count = column_count ?
	      parseInt(column_count) :
	      this._get_prefix_argument(0, stack.depth());
	if(expr_count <= 0)
	    return this.error_flash_stack();
        const [new_stack, ...exprs] = stack.pop_exprs(expr_count);
        const matrix_expr = new ArrayExpr(
            (matrix_type || 'bmatrix'),
            1, expr_count, [exprs]);
        return new_stack.push_expr(matrix_expr);
    }

    // Stack two ArrayExprs on top of each other.
    // The type of the array on the stack-top takes precedence if there's a conflict.
    // The two arrays/matrices have to have the same number of columns.
    do_stack_arrays(stack) {
        const [new_stack, m1, m2] = stack.pop_arrays(2);
        const new_array = ArrayExpr.stack_arrays(m1, m2);
        if(new_array)
            return new_stack.push_expr(new_array);
        else
            return new_stack.type_error();
    }

    // Split an ArrayExpr into its component rows and put them on the stack.
    do_split_array(stack) {
        const [new_stack, array_expr] = stack.pop_arrays(1);
        return new_stack.push_all_exprs(array_expr.split_rows());
    }

    // Take apart an ArrayExpr and put all its elements on the stack (in row-major order).
    do_dissolve_array(stack) {
        const [new_stack, array_expr] = stack.pop_arrays(1);
        let dissolved_exprs = [].concat(...array_expr.element_exprs);
        return new_stack.push_all_exprs(dissolved_exprs);
    }

    do_insert_matrix_ellipses(stack) {
        const [new_stack, matrix_expr] = stack.pop_matrices(1);
        return new_stack.push_expr(matrix_expr.with_ellipses());
    }

    do_transpose_matrix(stack) {
        const [new_stack, matrix_expr] = stack.pop_matrices(1);
        return new_stack.push_expr(matrix_expr.transposed());
    }

    // Change a matrix bracket type, e.g. to 'pmatrix'.
    do_change_matrix_type(stack, new_type) {
        const [new_stack, matrix_expr] = stack.pop_matrices(1);
        return new_stack.push_expr(matrix_expr.with_array_type(new_type));
    }

    // is_row_or_column: 'row', 'column'
    // separator_type: 'solid' or 'dashed'
    do_array_separator(stack, is_row_or_column, separator_type) {
        const [new_stack, matrix_expr] = stack.pop_matrices(1);
        const is_column = is_row_or_column === 'column';
        // NOTE: prefix argument of * indicates the final row or column of the matrix
        const size = is_column ? matrix_expr.column_count : matrix_expr.row_count;
        const index = this._get_prefix_argument(1, null);
        if(index !== null && (index < 1 || index > size-1))
            return this.error_flash_stack();
        else
            return new_stack.push_expr(
                matrix_expr.with_separator(
                    is_column,
                    index === null ? null : index-1,
                    separator_type, true));
    }

    do_build_align(stack, align_type) {
        // NOTE: if align_type = 'cases' or 'rcases', align on ':' infix if there is one, and then remove the infix
        const expr_count = this._get_prefix_argument(0, stack.depth());
	if(expr_count <= 0)
	    return this.error_flash_stack();
        const [new_stack, ...exprs] = stack.pop_exprs(expr_count);
        let split_mode;
        switch(align_type) {
        case 'gathered': case 'gather': split_mode = 'none'; break;
        case 'cases': case 'rcases': split_mode = 'colon'; break;
        case 'cases_if': split_mode = 'colon_if'; align_type = 'cases'; break;
        case 'rcases_if': split_mode = 'colon_if'; align_type = 'rcases'; break;
        default: split_mode = 'infix'; break;
        }
        const element_exprs = ArrayExpr.split_elements(exprs, split_mode)
        const array_expr = new ArrayExpr(
            align_type, element_exprs.length, element_exprs[0].length, element_exprs);
        return new_stack.push_expr(array_expr);
    }

    // Take [x_1,...,x_n] from the stack (where n is the prefix argument)
    // and build an InfixExpr with the given text between each term as an infix operator.
    // 'final_operand_text' is used as the next to last operand if provided.
    do_build_infix_list(stack, infix_text, final_operand_text) {
	this._require_prefix_argument(true);
        const expr_count = this._get_prefix_argument(1, stack.depth());
        const [new_stack, ...exprs] = stack.pop_exprs(expr_count);
        const infix_operator_expr = Expr.text_or_command(infix_text);
        let operand_exprs = exprs;
	if(final_operand_text) {
            // Splice in the final_operand if specified.
	    const final_operand = Expr.text_or_command(final_operand_text);
            operand_exprs = operand_exprs.slice(0, expr_count-1).concat(
                [final_operand]).concat(operand_exprs.slice(expr_count-1));
        }
        // Build up the resulting InfixExpr one term at a time.
        let new_expr = operand_exprs[0];
        for(let i = 1; i < operand_exprs.length; i++)
            new_expr = InfixExpr.combine_infix(
                new_expr, operand_exprs[i], infix_operator_expr);
	return new_stack.push_expr(new_expr);
    }

    // Take [x_1, ..., x_n] from the stack and build a \substack{...} command.
    // This is treated internally as a special kind of ArrayExpr.
    do_build_substack(stack) {
        const expr_count = this._require_prefix_argument();
        const [new_stack, ...exprs] = stack.pop_exprs(expr_count);
        const rows = exprs.map(expr => [expr]);  // Nx1 array
        return new_stack.push_expr(
            new ArrayExpr('substack', expr_count, 1, rows));
    }

    do_apply_tag(stack) {
        let [new_stack, tagged_item, tag_item] = stack.pop(2);
        if(tagged_item.item_type() !== 'expr')
            return stack.type_error();
        let tag_expr;
        // if(tag_item.item_type() === 'text')
        //     tag_expr = new CommandExpr('text', [new TextExpr(tag_item.source_text.trim())]);
        /*else*/ if(tag_item.item_type() === 'expr')
            tag_expr = tag_item.expr;
        else
            return stack.type_error();
        return new_stack.push(new ExprItem(tagged_item.expr, tag_expr));
    }

    // Copy stack top to an internal clipboard slot.
    // A prefix argument may be given to access other slots but this is currently undocumented
    // because prefix arguments with stack commands highlight items on the stack which is bad UI.
    do_copy_to_clipboard(stack) {
        const [new_stack, item] = stack.pop(1);
        const slot = this._get_prefix_argument(1, '*');
        this.app_component.state.clipboard_items[slot] = item;
        if(slot === 1)
            this.notify("Copied to clipboard");
        else
            this.notify("Copied to clipboard slot " + slot);
        this.perform_undo_or_redo = 'suppress';
        return new_stack.push(item);
    }

    do_paste_from_clipboard(stack) {
        const slot = this._get_prefix_argument(1, '*');
        const item = this.app_component.state.clipboard_items[slot];
        if(item)
            return stack.push(item.clone());
        else
            this.error_flash_stack();
    }

    // screen_percentage=0 means try to scroll so that the top of the selection is flush with the top of the document panel.
    // screen_percentage=100 tries to make the bottom of the selection flush with the bottom of the panel.
    // Anything in between is a linear interpolation between the two.
    do_recenter_document(stack, screen_percentage_string) {
        const screen_percentage = parseInt(screen_percentage_string);
        this.perform_undo_or_redo = 'suppress';
        
        // TODO: Accessing the DOM elements directly like this is a hack but there's not an easy
        // way to get it properly from React here.  May want to restructure things to make this cleaner.
        let container = document.getElementById('document_container');
        if(!container) return;
        const selected_elts = container.getElementsByClassName('selected')
        if(selected_elts.length === 0) return;
        const selected_elt = selected_elts[0];
        const top_scrolltop = selected_elt.offsetTop;
        const bottom_scrolltop = selected_elt.offsetTop + selected_elt.offsetHeight - container.clientHeight;
        const ratio = screen_percentage/100;
        const new_scrolltop = Math.round(top_scrolltop*(1-ratio) + bottom_scrolltop*ratio);
        container.scrollTop = new_scrolltop;
    }

    do_scroll(stack, panel_name, direction_string, percentage_string) {
        let panel_elt = document.getElementById(panel_name);
        if(!panel_elt) return;
        const percentage = parseInt(percentage_string || '50') / 100.0;
        if(direction_string === 'horizontal')
            panel_elt.scrollLeft += Math.round(panel_elt.clientWidth * percentage)
        else
            panel_elt.scrollTop += Math.round(panel_elt.clientHeight * percentage);
    }

    do_export_document_as_text(stack) {
        const exported_text = this.app_state.document.to_text();
        navigator.clipboard.writeText(exported_text);
        this.notify("Copied document to clipboard");
        this.perform_undo_or_redo = 'suppress';
    }

    do_export_stack_items_as_text(stack) {
        const arg = this._get_prefix_argument(1, stack.depth());
        // eslint-disable-next-line no-unused-vars
        const [new_stack, ...items] = stack.pop(arg);
        const exported_text = items.map(item => item.to_text()).join("\n\n");
        navigator.clipboard.writeText(exported_text);
        this.notify("Copied " + arg + " item" + (arg === 1 ? "" : "s") + " to clipboard");
        this.perform_undo_or_redo = 'suppress';
    }
}


export default InputContext;

