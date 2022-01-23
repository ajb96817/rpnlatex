
import {
    /*Settings, */ AppState,
    Expr, CommandExpr, PrefixExpr, InfixExpr, DeferExpr, TextExpr, SequenceExpr,
    DelimiterExpr, SubscriptSuperscriptExpr, ArrayExpr,
    Item, ExprItem, MarkdownItem, Stack /*, Document*/
} from './Models';


// This acts as a sort of extension to the main App component.
// TODO: rename -> EditorActions or something
class InputContext {
    constructor(app_component, settings) {
        this.app_component = app_component;
        this.mode = 'base';
        this.new_mode = null;
        this.new_document = null;
        this.files_changed = false;
        this.file_saved = false;
        this.settings = settings;

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

        // Tracks minieditor state for editing the stack-top.
        this.minieditor = {active: false};

        // If non-null, text-entry mode is active and the entry line will appear at the
        // bottom of the stack panel.
        this.text_entry = null;

        // Tracks multi-part custom_delimiters commands.
        this.custom_delimiters = {};
    }

    // Returns [was_handled, new_app_state]
    // NOTE: was_handled just indicates that a keybinding was found; it doesn't necessarily mean
    // that the command succeeded without error.
    handle_key(app_state, key) {
        if(key === 'Shift' || key === 'Alt' || key === 'Control')
            return [false, app_state];

        // Special case: if there's a current text_entry being accumulated, force
        // the 'text_entry' mode.
        if(this.text_entry !== null)
            this.mode = 'text_entry';

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
            } catch(e) {
                if(e.message === 'stack_underflow' || e.message === 'stack_type_error') {
                    this.error_flash_stack();
                    this.perform_undo_or_redo = null;
                    this.mode = 'base';
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
    error_flash_stack() { return this.error_flash_element(document.getElementById('stack_panel')); }
    error_flash_document() { return this.error_flash_element(document.getElementById('document_panel')); }
    clear_all_flashes() {
        const elt_ids = ['stack_panel', 'document_panel'];
        for(let elt_id = 0; elt_id < elt_ids.length; elt_id++) {
            let elt = document.getElementById(elt_ids[elt_id]);
            elt.classList.remove('errorflash');
        }
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
        const new_expr = this._build_subscript_superscript(base_expr, child_expr, is_superscript);
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

    do_dup(stack) {
        const [new_stack, item] = stack.pop(1);
        return new_stack.push_all([item, item]);
    }
    do_pop(stack) {
        // eslint-disable-next-line no-unused-vars
        const [new_stack, popped_item] = stack.pop(1);
        return new_stack;
    }
    // a b -> b
    do_nip(stack) {
        // eslint-disable-next-line no-unused-vars
        const [new_stack, a, b] = stack.pop(2);
        return new_stack.push(b);
    }
    do_swap(stack) {
        const [new_stack, a, b] = stack.pop(2);
        return new_stack.push_all([b, a]);
    }
    // a b -> b a b
    do_tuck(stack) {
        const [new_stack, a, b] = stack.pop(2);
        return new_stack.push_all([b, a, b]);
    }
    // a b -> a b a
    do_over(stack) {
        const [new_stack, a, b] = stack.pop(2);
        return new_stack.push_all([a, b, a]);
    }
    // a b c -> b c a
    do_rot(stack) {
        const [new_stack, a, b, c] = stack.pop(3);
        return new_stack.push_all([b, c, a]);
    }
    // a b c -> c a b
    do_unrot(stack) {
        const [new_stack, a, b, c] = stack.pop(3);
        return new_stack.push_all([c, a, b]);
    }
    // a_1 a_2 ... a_n N -> a_n ... a_2 a_1
    do_reverse_n(stack) {
        const [new_stack, item_count] = stack.pop_positive_integer();
        const [new_stack_2, ...items] = new_stack.pop(item_count);
        items.reverse();
        return new_stack_2.push_all(items);
    }
    do_reverse_all(stack) {
        const [new_stack, ...items] = stack.pop(stack.depth());
        items.reverse();
        return new_stack.push_all(items);
    }
    do_clear_stack() {
        return new Stack([]);
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

        // Start the document with a default header showing the filename.
        this.new_document = new_state.document.insert_item(new MarkdownItem('# ' + new_filename));
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

    do_pop_to_document(stack, arg) {
        const [new_stack, item] = stack.pop(1);
        this.new_document = this.app_state.document.insert_item(item);
        return new_stack;
    }

    do_copy_to_document(stack, arg) {
        const item = stack.peek(1);
        this.new_document = this.app_state.document.insert_item(item);
    }

    do_recall_from_document(stack, arg) {
        const item = this.app_state.document.selected_item();
        if(item)
            return stack.push(item);
        else
            this.error_flash_document();
    }

    do_extract_from_document(stack, arg) {
        const item = this.app_state.document.selected_item();
        if(item) {
            this.new_document = this.app_state.document.delete_selection();
            return stack.push(item);
        }
        else
            this.error_flash_document();
    }

    do_edit_stack_top(stack) {
        const item = stack.peek(1);
        let source_text;
        switch(item.item_type()) {
        case 'markdown': source_text = item.source_text; break;
        case 'expr': source_text = ['$$', item.expr.to_latex(), '$$'].join(''); break;
        default: source_text = '???'; break;
        }
        this.switch_to_mode('editor');
        this.minieditor = {active: true, text: source_text};
    }

    // Start editing a new blank item on the stack.
    do_edit_new_item(stack) {
        const new_stack = this.do_insert_markdown(stack, '');
        this.do_edit_stack_top(new_stack);
        return new_stack;
    }

    // Pull the item below the stack top (i.e. below the item currently being edited)
    // into the current editor.
    // If the imported item is a Markdown item, its text is integrated directly;
    // otherwise an inline LaTeX fragment is created.
    do_import_item_into_editor(stack) {
        this.switch_to_mode('editor');
        const [new_stack, item, edited_item] = stack.pop(2);
        let inserted_text;
        switch(item.item_type()) {
        case 'markdown': inserted_text = item.source_text; break;
        case 'expr': inserted_text = ['$', item.expr.to_latex(), '$'].join(''); break;
        default: inserted_text = '???'; break;
        }
        this._insert_text_into_minieditor(inserted_text);
        return new_stack.push(edited_item);
    }

    // Attempt to insert a text string into the active minieditor.
    _insert_text_into_minieditor(text) {
        if(!this.minieditor.active) return false;
        let editor_elt = this.minieditor.ref.current;
        if(!editor_elt) return false;
        if(editor_elt.setRangeText)
            editor_elt.setRangeText(text, editor_elt.selectionStart, editor_elt.selectionEnd, "end");
        else {
            // Fallback method for older browsers
            editor_elt.focus();
            document.execCommand('insertText', false, text);
        }
        return true;
    }

    do_finish_editing(stack) {
        if(!this.minieditor.active) return;
        let editor_elt = this.minieditor.ref.current;
        const content = ((editor_elt ? editor_elt.value : null) || '').trim();
        const [new_stack, old_item] = stack.pop(1);
        this.minieditor = {active: false};
        if(content.length > 0) {
            const new_item = Item.from_string(content);
            // If no textual changes were made to an Expr, just keep the old one instead of
            // building a new TextExpr.  This preserves any expression structure that was there.
            if(new_item.item_type() === 'expr' && old_item.item_type() === 'expr' &&
               old_item.expr.to_latex() === new_item.expr.to_latex())
                return new_stack.push(old_item);
            else
                return new_stack.push(Item.from_string(content));
        }
        else
            return new_stack;
    }

    do_cancel_editing(stack) {
        const [new_stack, old_item] = stack.pop(1);
        this.minieditor = {active: false};

        // If the item that was being edited was an empty Markdown item, drop it from the stack now.
        // Otherwise, leave it untouched.
        if(old_item.item_type() === 'markdown' && old_item.is_empty())
            return new_stack;
        else 
            return new_stack.push(old_item);
    }

    do_cancel_text_entry(stack) {
        this.text_entry = null;
        this.perform_undo_or_redo = 'suppress';
        return stack;
    }

    do_insert_markdown(stack, text) {
        return stack.push(new MarkdownItem(text));
    }

    do_insert(stack, text) {
        // TODO: handle this better
        text = text || '';  // handle 'insert nothing' case
        if(text.startsWith("\\"))
            return stack.push_expr(new CommandExpr(text.slice(1)));
        else
            return stack.push_expr(new TextExpr(text));
    }

    do_self_insert(stack) {
        return this.do_insert(stack, this.last_keypress);
    }

    do_insert_defer(stack) {
        return stack.push_expr(new DeferExpr());
    }

    // Used for \mathscr / \mathcal, which only have uppercase glyphs.
    // case_type: 'uppercase', 'lowercase'
    // Stack top can be a ExprItem with a simple TextExpr, or else a MarkdownItem.
    do_to_case(stack, case_type) {
        const convert_fn = string => {
            switch(case_type) {
            case 'uppercase': return string.toUpperCase();
            case 'lowercase': return string.toLowerCase();
            default: return string;
            }
        };
        const [new_stack, item] = stack.pop(1);
        switch(item.item_type()) {
        case 'markdown':
            return new_stack.push(new MarkdownItem(convert_fn(item.source_text)));
        case 'expr':
            {   let new_expr;
                if(item.expr.expr_type() === 'text')
                    new_expr = new TextExpr(convert_fn(item.expr.text));
                else new_expr = item.expr;
                return new_stack.push_expr(new_expr);
            }
        default:
            return stack.type_error();
        }
    }

    // Pop arity_string items (default 1) and turn them into an Command expr.
    do_operator(stack, opname, arity_string = '1') {
        const arity = parseInt(arity_string);
        const [new_stack, ...popped_exprs] = stack.pop_exprs(arity);
        const result_expr = new CommandExpr(opname, popped_exprs)
        return new_stack.push_expr(result_expr);
    }

    // \sin{x} etc.  Works similarly to do_operator except the argument is autoparenthesized.
    // If superscript_text is given, the text is applied as a superscript to the function
    // itself (not to the argument).
    do_named_function(stack, funcname, superscript_text) {
        let [new_stack, arg_expr] = stack.pop_exprs(1);
        const orig_funcname = funcname;
        if(superscript_text !== undefined) {
            // \sin^2{arg} etc.  This is a little awkward because the "head" of the command (\sin^2) is
            // no longer a simple LaTeX command like other CommandExprs.  Fortunately, things work out fine
            // treating it as such by just textually concatenating the superscript (putting in explicit braces
            // if necessary).  For example: "sin^2" or "sin^{-1}".
            if(superscript_text.length > 1)
                superscript_text = '{' + superscript_text + '}';
            funcname = funcname + '^' + superscript_text;
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

    // Same as do_operator, except if the object the hat is being added to is a literal 'i' or 'j',
    // or bolded i/j, it's first converted into a \imath or \jmath to remove the dot.
    do_apply_hat(stack, hat_op) {
        let [new_stack, expr] = stack.pop_exprs(1);
        if(expr.expr_type() === 'text' &&
           (expr.text === 'i' || expr.text === 'j'))
            expr = new CommandExpr(expr.text === 'i' ? 'imath' : 'jmath');
        else if(expr.expr_type() === 'command' && expr.operand_count() === 1 &&
                (expr.command_name === 'boldsymbol' || expr.command_name === 'mathbf')) {
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

    do_color(stack, colorname) {
        let [new_stack, expr] = stack.pop_exprs(1);

        // Strip off any existing \textcolor
        if(expr.expr_type() === 'command' &&
           expr.command_name === 'textcolor' && expr.operand_count() === 2)
            expr = expr.operand_exprs[1];

        const new_expr = new CommandExpr('textcolor', [new TextExpr(colorname), expr]);
        return new_stack.push_expr(new_expr);
    }

    do_start_text_entry(stack) {
        this.text_entry = '';
        this.perform_undo_or_redo = 'suppress';
        return stack;
    }

    do_custom_delimiter(stack, delimiter_type) {
        this.switch_to_mode('custom_delimiters');
        if(!delimiter_type) {
            // Start new sequence
            this.custom_delimiters = {arity: 1};
            return;
        }
        if(!this.custom_delimiters.left) {
            this.custom_delimiters.left = delimiter_type;
            return;
        }
        if(!this.custom_delimiters.right) {
            this.custom_delimiters.right = delimiter_type;
            if(this.custom_delimiters.arity === 1)
                return this._finish_custom_delimiters(stack);
            else return;
        }
        this.custom_delimiters.middle = delimiter_type;
        return this._finish_custom_delimiters(stack);
    }

    do_custom_delimiter_arity(stack, arity_string) {
        this.switch_to_mode('custom_delimiters');
        this.custom_delimiters.arity = parseInt(arity_string);
    }

    _finish_custom_delimiters(stack) {
        this.switch_to_mode('base');
        const d = this.custom_delimiters;
        const [new_stack, ...exprs] = stack.pop_exprs(d.arity);
        const new_expr = new DelimiterExpr(d.left, d.right, d.middle, exprs);
        this.custom_delimiters = {};
        return new_stack.push_expr(new_expr);
    }

    // opname can be either a \latex_command or a regular string like '+'
    do_infix(stack, opname) {
        const [new_stack, left_expr, right_expr] = stack.pop_exprs(2);
        let operator_expr;
        if(opname.startsWith("\\"))  // TODO: handle this better
            operator_expr = new CommandExpr(opname.slice(1));
        else
            operator_expr = new TextExpr(opname);
        return new_stack.push_expr(new InfixExpr(operator_expr, left_expr, right_expr));
    }

    // Similar to do_infix but only takes 1 item from the stack and makes a PrefixExpr.
    do_prefix(stack, opname) {
        const [new_stack, base_expr] = stack.pop_exprs(1);
        let operator_expr;
        if(opname.startsWith("\\"))  // TODO: handle this better
            operator_expr = new CommandExpr(opname.slice(1));
        else
            operator_expr = new TextExpr(opname);
        return new_stack.push_expr(new PrefixExpr(base_expr, operator_expr));
    }

    // Same as do_infix(..., '+'/'-') but automatically converts to infix minus/plus if the
    // right hand side starts with a unary -.
    do_infix_plus_or_minus(stack, opname) {
        let [new_stack, left_expr, right_expr] = stack.pop_exprs(2);
        let operator_expr;
        if(right_expr.expr_type() === 'prefix' &&
           right_expr.prefix_expr.expr_type() === 'text' && right_expr.prefix_expr.text === '-') {
            operator_expr = new TextExpr(opname === '-' ? '+' : '-');
            right_expr = right_expr.base_expr;
        }
        else
            operator_expr = new TextExpr(opname);
        return new_stack.push_expr(new InfixExpr(operator_expr, left_expr, right_expr));
    }

    do_split_infix(stack) {
        const [new_stack, infix_expr] = stack.pop_exprs(1);
        if(infix_expr.expr_type() !== 'infix') {
            this.error_flash_stack();
            return;
        }
        const split_mode = infix_expr.split;
        let new_split_mode = null;
        if(split_mode === 'after') new_split_mode = 'before';
        else if(split_mode === 'before') new_split_mode = null;
        else new_split_mode = 'after';
        const new_infix_expr = infix_expr.with_split_mode(new_split_mode);
        return new_stack.push_expr(new_infix_expr);
    }

    // Take an infix expression and another expression from the stack.
    // Turn it into an \overset or \underset infix expression that stacks the expression
    // above or below the original infix operator.
    do_stackrel(stack, overset_op) {
        const [new_stack, infix_expr, stacked_expr] = stack.pop_exprs(2);
        if(infix_expr.expr_type() !== 'infix') {
            this.error_flash_stack();
            return;
        }
        const new_op_expr = new CommandExpr(overset_op, [stacked_expr, infix_expr.operator_expr]);
        const new_expr = new InfixExpr(new_op_expr, infix_expr.left_expr, infix_expr.right_expr);
        return new_stack.push_expr(new_expr);
    }

    do_cancel() {}

    // Dummy 'command' to give explicit names to non-obvious commands for the keymap editor.
    do_name() {}

    // Concatenate two Exprs, or two Markdown texts.
    // TODO: possibly allow Expr+Markdown too
    do_concat(stack, concat_mode) {
        let [new_stack, left_item, right_item] = stack.pop(2);
        if(left_item.item_type() === 'expr' && right_item.item_type() === 'expr') {
            let left_expr = left_item.expr, right_expr = right_item.expr;
            if(concat_mode === 'autoparenthesize') {
                // Parenthesize left and right arguments if they're low-precedence
                // infix expressions.  e.g.:  x+y x-y -> (x+y)(x-y)
                left_expr = DelimiterExpr.autoparenthesize(left_expr);
                right_expr = DelimiterExpr.autoparenthesize(right_expr);
            }
            const new_expr = Expr.combine_pair(left_expr, right_expr);
            return new_stack.push_expr(new_expr);
        }
        else if(left_item.item_type() === 'markdown' && right_item.item_type() === 'markdown') {
            // TODO: maybe add a newline separator in between if needed.
            const new_text = left_item.source_text + right_item.source_text;
            return new_stack.push(new MarkdownItem(new_text));
        }
        else
            return stack.type_error();
    }

    do_substitute_defer(stack) {
        let [new_stack, original_expr, substitution_expr] = stack.pop_exprs(2);
        const defer_expr = original_expr.find_defer();
        if(defer_expr) {
            const new_expr = original_expr.substitute_expr(defer_expr, substitution_expr);
            return new_stack.push_expr(new_expr);
        }
        else
            return stack.type_error();
    }

    do_append_text_entry(stack) {
        const key = this.last_keypress;
        let text = this.text_entry || '';
        if(key.length === 1)
            this.text_entry = text + key;
        this.perform_undo_or_redo = 'suppress';
        return stack;
    }

    do_backspace_text_entry(stack) {
        let text = this.text_entry || '';
        this.perform_undo_or_redo = 'suppress';
        if(text.length > 0)
            this.text_entry = text.slice(0, -1);
        else
            this.text_entry = null;
        return stack;
    }

    // If textstyle is supplied, apply the given text style to the entered text.
    // (allowed values: "roman", "latex")
    do_finish_text_entry(stack, textstyle) {
        this.perform_undo_or_redo = 'suppress';
        if(this.text_entry === null)
            return stack;  // shouldn't happen
        let new_expr;
        if(textstyle === 'roman')
            new_expr = new CommandExpr('mathrm', [new TextExpr(this._latex_escape(this.text_entry))]);
        else if(textstyle === 'latex') {
            const sanitized = this.text_entry.replaceAll(/[^a-zA-Z]/g, '');
            if(sanitized.length === 0) {
                this.text_entry = null;
                return stack;
            }
            new_expr = new TextExpr("\\" + sanitized);
        }
        else
            new_expr = new TextExpr(this._latex_escape(this.text_entry));
        
        this.text_entry = null;
        return stack.push_expr(new_expr);
    }

    // TODO: may want to make this a general utility method, but it's only used here so far.
    _latex_escape(text) {
        const replacements = {
            '_': "\\_",
            '^': "\\wedge",
            '%': "\\%",
            "'": "\\prime",
            "`": "\\backprime",
            ' ': "\\,",
            '$': "\\$",
            '&': "\\&",
            '#': "\\#",
            '}': "\\}",
            '{': "\\{",
            '~': "\\sim",
            "\\": "\\backslash",
        };
        return text.replaceAll(/[_^%'` $&#}{~\\]/g, match => replacements[match]);
    }

    // expr_count is the number of items to pop from the stack to put inside the delimiters.
    // It defaults to 1, but if it's 2 or more, 'middle' is used to separate each item within
    // the delimiters.
    do_delimiters(stack, left, right, middle, expr_count_string) {
        const expr_count = (expr_count_string === undefined) ? 1 : parseInt(expr_count_string);
        const [new_stack, ...inner_exprs] = stack.pop_exprs(expr_count);
        const new_expr = new DelimiterExpr(left, right, middle, inner_exprs);
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

    do_autoparenthesize(stack) {
        let [new_stack, expr] = stack.pop_exprs(1);
        return new_stack.push_expr(DelimiterExpr.autoparenthesize(expr));
    }

    // Combine arguments and command name from the stack into a CommandExpr
    do_apply_operator(stack, arg_count_string) {
        const arg_count = parseInt(arg_count_string);
        const [new_stack, ...exprs] = stack.pop_exprs(arg_count+1);
        const command_expr = exprs[exprs.length-1], operand_exprs = exprs.slice(0, arg_count);
        if(command_expr.expr_type() === 'command' && command_expr.operand_count() === 0)
            return new_stack.push_expr(
                new CommandExpr(command_expr.command_name, operand_exprs));
        else
            this.error_flash_stack();
    }

    // Take (left, right, operator) from the stack and create an InfixExpr.
    do_apply_infix(stack) {
        const [new_stack, left_expr, right_expr, operator_expr] = stack.pop_exprs(3);
        const new_expr = new InfixExpr(operator_expr, left_expr, right_expr);
        return new_stack.push_expr(new_expr);
    }

    do_toggle_popup(stack, mode_string) {
        // Hack: save help panel scroll position so we can restore it next
        // time the help is displayed.
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
        switch(config_option) {
        case 'zoom_factor':
            switch(value) {
            case '0': layout.zoom_factor = 0; break;
            case '+': layout.zoom_factor++; break;
            case '-': layout.zoom_factor--; break;
            default: break;
            }
            break;
        case 'math_align':
            switch(value) {
            case 'toggle_document':
                layout.document_rightalign_math = !layout.document_rightalign_math;
                break;
            case 'toggle_stack':
                layout.stack_rightalign_math = !layout.stack_rightalign_math;
                break;
            default:
                break;
            }
            break;
        case 'stack_side':
            layout.stack_side = value;
            break;
        case 'stack_split':
            layout.stack_split = parseInt(value);
            break;
        case 'theme':
            settings.selected_theme = value;
            break;
        case 'reset_layout':
            settings.layout = settings.default_layout();
            break;
        default:
            break;
        }
        settings.save();
        this.app_component.apply_layout_to_dom();
        this.clear_all_flashes();
    }

    // item1, item2, ..., N => {item1, item2, ...}
    do_build_matrix_row(stack, matrix_type) {
        const [new_stack, expr_count] = stack.pop_positive_integer();
        const [new_stack_2, ...exprs] = new_stack.pop_exprs(expr_count);
        const matrix_expr = new ArrayExpr(
            (matrix_type || 'bmatrix'),
            1, expr_count,
            [exprs]
        );
        return new_stack_2.push_expr(matrix_expr);
    }

    // Stack two ArrayExprs on top of each other.
    // The type of the matrix on the stack-top takes precedence if there's a conflict.
    // The two matrices have to have the same number of columns.
    do_stack_matrices(stack) {
        // TODO: allow stacking 'align' exprs, etc (where is_matrix isn't necessarily true)
        const [new_stack, m1, m2] = stack.pop_matrices(2);
        if(m1.column_count !== m2.column_count)
            new_stack.type_error();
        const new_array = new ArrayExpr(
            m2.array_type,
            m1.row_count + m2.row_count,
            m1.column_count,
            m1.element_exprs.concat(m2.element_exprs)
        );
        return new_stack.push_expr(new_array);
    }

    // Split an ArrayExpr into its component rows and put them on the stack.
    do_split_matrix(stack) {
        // TODO: allow non-matrix arrays here
        const [new_stack, array_expr] = stack.pop_matrices(1);
        return new_stack.push_all_exprs(array_expr.split_rows());
    }

    // Take apart an ArrayExpr and put all its elements on the stack (in row-major order).
    do_dissolve_matrix(stack) {
        // TODO: allow non-matrix arrays here
        const [new_stack, matrix_expr] = stack.pop_matrices(1);
        let dissolved_exprs = [].concat(...matrix_expr.element_exprs);
        return new_stack.push_all_exprs(dissolved_exprs);
    }

    do_insert_matrix_ellipses(stack) {
        const [new_stack, matrix_expr] = stack.pop_matrices(1);
        return new_stack.push_expr(matrix_expr.with_ellipses());
    }

    do_matrix_transpose(stack) {
        const [new_stack, matrix_expr] = stack.pop_matrices(1);
        return new_stack.push_expr(matrix_expr.transposed());
    }

    do_build_align(stack, align_type) {
        // NOTE: if align_type = 'cases' or 'rcases', align on ':' infix if there is one, and then remove the infix
        const [new_stack, expr_count] = stack.pop_positive_integer();
        const [new_stack_2, ...exprs] = new_stack.pop_exprs(expr_count);

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
        return new_stack_2.push_expr(array_expr);
    }

    // item1, item2, ..., N => "item1, item2, ..."
    // (concatenate N items from the stack with separator_text between each one)
    do_build_list(stack, separator_text, final_separator_text) {
        const [new_stack, expr_count] = stack.pop_positive_integer();
        const [new_stack_2, ...exprs] = new_stack.pop_exprs(expr_count);
        let expr = exprs[0];
        for(let i = 1; i < expr_count; i++) {
            const s = (final_separator_text && i === expr_count-1) ? final_separator_text : separator_text;
            expr = Expr.combine_pair(expr, new TextExpr(s));
            expr = Expr.combine_pair(expr, exprs[i]);
        }
        return new_stack_2.push_expr(expr);
    }

    // Take [x_1,...,x_n, infix_operator, item_count] from the stack
    // and build a nested InfixExpr.  'final_separator_text' is used as
    // the next to last item if provided.
    do_build_infix_list(stack, final_separator_text) {
        const [new_stack, expr_count] = stack.pop_positive_integer();
        const [new_stack_2, infix_operator_expr] = new_stack.pop_exprs(1);
        const [new_stack_3, ...exprs] = new_stack_2.pop_exprs(expr_count);
        let expr = exprs[expr_count-1];
        if(final_separator_text && expr_count > 1)
            expr = new InfixExpr(infix_operator_expr, new TextExpr(final_separator_text), expr);
        for(let i = expr_count-2; i >= 0; i--)
            expr = new InfixExpr(infix_operator_expr, exprs[i], expr);
        return new_stack_3.push_expr(expr);
    }

    // Take [x_1, ..., x_n, item_count] from the stack and build
    // a \substack{...} command.  This "cheats" by converting the stacked items
    // to LaTeX and concatenating with \\ so any structure in the stacked items
    // will be lost, same as do_build_list(), etc.
    do_build_substack(stack) {
        const [new_stack, expr_count] = stack.pop_positive_integer();
        const [new_stack_2, ...exprs] = new_stack.pop_exprs(expr_count);
        const content = exprs.map(expr => expr.to_latex()).join("\\\\");
        const new_expr = new CommandExpr('substack', [new TextExpr(content)]);
        return new_stack_2.push_expr(new_expr);
    }

    do_apply_tag(stack) {
        let [new_stack, tagged_item, tag_item] = stack.pop(2);
        if(tagged_item.item_type() !== 'expr')
            return stack.type_error();
        let tag_expr;
        if(tag_item.item_type() === 'markdown')
            tag_expr = new CommandExpr('text', [new TextExpr(tag_item.source_text.trim())]);
        else if(tag_item.item_type() === 'expr')
            tag_expr = tag_item.expr;
        else
            return stack.type_error();
        return new_stack.push(new ExprItem(tagged_item.expr, tag_expr));
    }

    do_copy_to_clipboard(stack) {
        const [new_stack, item] = stack.pop(1);
        this.app_component.state.clipboard_item = item;
        this.notify("Copied to clipboard");
        return new_stack.push(item);
    }

    do_paste_from_clipboard(stack) {
        const item = this.app_component.state.clipboard_item;
        if(item)
            return stack.push(item);
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
    }

    do_export_stack_top_as_text(stack) {
        const [new_stack, item] = stack.pop(1);
        const exported_text = item.to_text();
        navigator.clipboard.writeText(exported_text);
        this.notify("Copied stack top to clipboard");
        return new_stack.push(item)
    }
}


export default InputContext;

