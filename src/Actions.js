
// Editor action commands, invoked from keybindings (from Keymap.js).
// The main class InputContext here manages the editor state and dispatches
// commands from the keymap according to user input.

import {
  AppState, Document, Stack, TextEntryState,
  ExprPath, RationalizeToExpr,
  ExprItem, TextItem, CodeItem,
} from './Models';
import {
  Expr, CommandExpr, FontExpr, InfixExpr, PrefixExpr,
  PostfixExpr, FunctionCallExpr, PlaceholderExpr, TextExpr,
  SubscriptSuperscriptExpr, DelimiterExpr,
  ArrayExpr, TensorExpr /*, SequenceExpr*/
} from './Exprs';
import {
  AlgebriteInterface, double_to_expr
} from './CAS';


// This acts as a sort of extension to the main App component.
// Any method starting with do_ can be directly invoked by keybindings.
// TODO: rename -> EditorActions or something
class InputContext {
  constructor(app_component, settings) {
    this.app_component = app_component;
    this.settings = settings;
    this.mode = 'base';  // current keymap mode
    this._reset();

    // Current prefix argument for commands like Swap; can be one of:
    //   null - no current prefix argument
    //   >= 1 - normal prefix argument
    //   < 0  - "all" prefix argument (apply to all available items)
    // Prefix arguments are cleared after any normal command is executed
    // or if there's an error.  "Normal" command means anything that's not
    // another prefix argument key.
    this.prefix_argument = null;

    // Number of rows specified in do_matrix().  This will be used by
    // a subsequent do_finish_build_matrix() command.
    this.matrix_row_count = null;

    // If non-null, text-entry mode is active and the entry line will appear at the
    // bottom of the stack panel.  this.text_entry will be a TextEntryState object.
    this.text_entry = null;
  }

  // Returns [was_handled, new_app_state].
  // NOTE: was_handled just indicates that a keybinding was found; it doesn't necessarily mean
  // that the command succeeded without error.
  handle_key(app_state, key) {
    // If a popup panel (files/helptext) is active, always use its dedicated keymap.
    const effective_mode = this.settings.popup_mode || this.mode;
    const command = this.settings.current_keymap
          .lookup_binding(effective_mode, key);
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
    for(const command of commands) {
      const [command_name, ...parameters] = command;
      const handler_function = this['do_' + command_name];
      if(!handler_function)
        return null;
      try {
        this.app_state = app_state;
        // Reset context variables for the handler functions to use.
        this._reset();
        // Execute the handler and assemble the new state.
        // The action handler function is expected to return the "new" (updated) stack,
        // or null/undefined to indicate no changes (leaving any arguments on the stack).
        // Helper functions like .notify() therefore should return 'undefined' so the
        // action handler functions can do "return this.notify('...')" etc.
        const new_stack = (handler_function.bind(this))(app_state.stack, ...parameters);
        let new_app_state = new AppState(
          new_stack || app_state.stack,
          this.new_document || app_state.document
        );
        // Mark app state as 'dirty' (unsaved changed) if anything changed, but not if
        // suppress_undo() has been called, which indicates a minor action like changing
        // the document selection.
        new_app_state.is_dirty = app_state.is_dirty ||
          (this.perform_undo_or_redo !== 'suppress' && !new_app_state.same_as(app_state));
        if(this.file_saved_or_loaded)
          new_app_state.is_dirty = false;
        app_state = new_app_state;
        // Switch back into base mode if the mode was not explicitly set by the handler.
        this.mode = this.new_mode || 'base';
        // Clear the prefix argument if the last command was not explicitly 'prefix_argument'.
        if(!this.preserve_prefix_argument)
          this.prefix_argument = null;
      } catch(e) {
        this.error_flash_stack();
        this.perform_undo_or_redo = null;
        this.mode = 'base';
        this.prefix_argument = null;
        if(!['stack_underflow', 'stack_type_error', 'prefix_argument_required'
            ].includes(e.message)) {
          // "Normal" errors like stack underflow don't display a message
          // (only flash the screen).  Others errors, including exceptions from
          // Algebrite, will be shown in red.
          this.report_error(e.message, e.offending_expr);
        }
        if(this.settings.debug_mode)
          throw e;  // don't "hide" exceptions in debug mode
        return null;
      }
      finally {
        // Avoid holding references longer than needed.
        this.app_state = null;
        this.new_document = null;
      }
    }
    return app_state;
  }

  // Clear the input context variables in preparation to handle a new command.
  // TODO: maybe have this.changed.mode, this.changed.document etc.
  _reset() {
    // Watch to see if the handler sets new_mode.  If it does, switch to that
    // mode after the command is finished, but otherwise switch back to base mode.
    this.new_mode = null;
    // The handler function will set this if the document changes.
    // (Stack changes are expected to be returned by the handler function.)
    this.new_document = null;
    // This this will be set to true if anything changed about the file list /
    // file selection.  The file_manager.available_files will be reloaded from
    // localStorage and the FileManagerComponent will be re-rendered
    // (so this is set even for things like changing the selected_filename).    
    this.files_changed = false;
    // This will be set to true if the current app_state was saved or loaded by this action.
    // This indicates that the app state's dirty flag should be cleared.
    this.file_saved_or_loaded = false;
    // If this is set to true, the prefix_argument will be kept as it as (otherwise it's reset to
    // null after each action).
    this.preserve_prefix_argument = false;
    // If set, this will be displayed as a transient notification in
    // the stack area.  Cleared after every keypress.
    this.notification_text = null;
    this.error_message = null;
    // Special indicator to help control the undo stack:
    //   null - save state to undo stack after this action as normal
    //   'undo' - request an undo
    //   'redo' - request a redo of last saved undo state (if any)
    //   'suppress' - perform action as normal, but don't save state to the undo state
    //                (used for 'minor' actions that don't warrant undo tracking)
    //   'clear' - undo stack will be reset (e.g. when loading a new document)
    this.perform_undo_or_redo = null;
  }

  // NOTE: This doesn't raise an exception, it only records the error message
  // for subsequent display.
  // TODO: optional flash_stack / flash_document argument
  report_error(message, offending_expr) {
    // Try to clean up wording of error messages generated by Algebrite.
    if(message.startsWith('Stop: '))
      message = message.slice(6);
    if(message.includes('tensor dimension check'))
      message = 'Matrix sizes incompatible';
    if(message.endsWith('Stop: syntax error'))
      message = 'Syntax error';  // TODO: highlight error position in editor
    this.error_message = {
      message: message,
      offending_expr: offending_expr
    };
  }

  switch_to_mode(new_mode) { this.new_mode = new_mode; }

  update_document(new_document) { this.new_document = new_document;  }

  notify(text) { this.notification_text = text; }

  // Don't include the results of this action in the undo stack.
  // This will also suppress marking the app state 'dirty' (unsaved changes).
  suppress_undo() { this.perform_undo_or_redo = 'suppress'; }

  change_selected_filename(filename) {
    let file_manager = this.app_component.state.file_manager
    const settings = this.settings;
    file_manager.selected_filename = filename;
    file_manager.save_settings(settings);
    this.files_changed = true;
  }

  // "Flash" the stack or document panel with a CSS animation to indicate an error.
  // This requires some special handling due to a limitation of CSS animations:
  // 
  // The stack and document panel elements both start with a paused error-flash
  // animation that runs for 1 cycle.  We trigger the animation by setting the
  // play-state to running.  Unfortunately, with CSS, there is no clean way of
  // actually restarting the animation to prepare for the next error.  The usual
  // hack to get around this is to remove a CSS class with the animation rule,
  // trigger a browser re-layout (by querying a property such as elt.offsetWidth),
  // and then re-add the CSS class to reset the animation.  Instead of that,
  // we alternate between two identical sets of keyframes by changing the animation
  // name itself (no manipulation of CSS classes).  Once the animation name is
  // changed, the "new" animation starts again at the beginning in the paused state,
  // and we can immediately trigger it by setting the play state to running.
  //
  // 'animation_base_name' is either 'errorflash_stack' or 'errorflash_document'
  // and the "theme" (sepia/eink) and '_1' or '_2' are appended to this to flip
  // between the alternate identical animations.
  error_flash_element(dom_element, animation_base_name) {
    // NOTE: 'inverse_video' needs no special handling here.
    // It's treated as if it were the default theme/filter.
    const theme_suffix =
          this.settings.filter === 'sepia' ? '_sepia' :
          this.settings.filter === 'eink' ? '_eink' : '';
    // First, explicitly pause the animation to re-arm it before the new
    // animation name is set.
    dom_element.style.animationPlayState = 'paused';
    // Switch to the alternate animation name and set it running.
    const animation_names = ['_1', '_2'].map(suffix =>
      [animation_base_name, theme_suffix, suffix].join(''));
    dom_element.style.animationName = animation_names[
      dom_element.style.animationName === animation_names[0] ? 1 : 0];
    dom_element.style.animationPlayState = 'running';
  }

  error_flash_stack() {
    if(this.settings.layout.stack_split === 0)
      return this.error_flash_document();
    else
      return this.error_flash_element(
        document.getElementById('stack_panel'),
        'errorflash_stack');
  }

  error_flash_document() {
    if(this.settings.layout.stack_split === 100)
      return this.error_flash_stack();
    else
      return this.error_flash_element(
        document.getElementById('document_panel'),
        'errorflash_document');
  }

  do_cancel() {}
  do_mode(stack, new_mode) { this.switch_to_mode(new_mode); }
  do_undo() { this.perform_undo_or_redo = 'undo'; }
  do_redo() { this.perform_undo_or_redo = 'redo'; }

  // Hook for [$][~] debugging command.
  do_debug(stack) {
    return stack;
  }

  do_subscript(stack, autoparenthesize) {
    return this._build_subscript_superscript(stack, true, autoparenthesize);
  }
  do_superscript(stack, autoparenthesize) {
    return this._build_subscript_superscript(stack, false, autoparenthesize);
  }
  // Second-to-top stack item becomes the base, while the stack top becomes the
  // subscript or superscript depending on 'is_subscript'.
  _build_subscript_superscript(stack, is_subscript, autoparenthesize) {
    const [new_stack, base_expr, child_expr] = stack.pop_exprs(2);
    const new_expr = base_expr.with_subscript_or_superscript(
      child_expr, is_subscript,
      autoparenthesize === 'false' ? false :
        autoparenthesize === 'true' ? true :
        this.settings.autoparenthesize);
    return new_stack.push_expr(new_expr);
  }

  // Add a \prime to the stack top; this is almost like do_superscript with \prime
  // but needs some special handling to coalesce multiple \prime into a single superscript.
  do_prime(stack) {
    const [new_stack, base_expr] = stack.pop_exprs(1);
    // For function calls, put the prime on the function name instead of
    // the expression as a whole: f(x) -> f'(x).
    if(base_expr.is_function_call_expr())
      return new_stack.push_expr(new FunctionCallExpr(
        base_expr.fn_expr.with_prime(false /* don't parenthesize */),
        base_expr.args_expr));
    else
      return new_stack.push_expr(
        base_expr.with_prime(this.settings.autoparenthesize));
  }

  do_sympy(stack, operation) {
    const pyodide = this.app_component.state.pyodide_interface;
    switch(operation) {
    case 'initialize':
      if(pyodide.state === 'uninitialized')
        pyodide.initialize();
      break;
    case 'shutdown':
      pyodide.shutdown();
      break;
    }
    return stack;
  }

  // function_name:
  //   Algebrite function to call.
  // mode:
  //   'normal': apply function as normal
  //   'bothsides': if applied to an 'equation' (x=y, x<y, etc),
  //                apply function to both sides separately
  // arg_count_string:
  //   Number of arguments to pop from the stack (default 1).
  // guess_variable_arg_index_string:
  //   If given, guess the variable in the first argument expression
  //   and splice it into the Algebrite function call args list at the
  //   given position (e.g. '1' will put it as the second arg).
  do_algebrite(stack, mode, function_name, arg_count_string,
               guess_variable_arg_index_string) {
    const arg_count = arg_count_string ? parseInt(arg_count_string) : 1;
    const [new_stack, ...argument_exprs] = stack.pop_exprs(arg_count);
    if(function_name === 'factor' && arg_count === 1 &&
       argument_exprs[0].is_text_expr_with_number()) {
      // Special case for 1-argument factor() applied to a simple
      // (nonnegative) number: don't try to guess the "variable", just
      // call factor(123) which performs prime factorization.
    }
    else if(guess_variable_arg_index_string) {
      const guess_variable_arg_index = parseInt(guess_variable_arg_index_string);
      const [/*guessed_variable_name*/, guessed_variable_expr] =
            AlgebriteInterface.guess_variable(argument_exprs[0]);
      if(guessed_variable_expr)
        argument_exprs.splice(guess_variable_arg_index, 0, guessed_variable_expr);
      else {
        this.report_error('Could not guess variable');
        return this.error_flash_stack();
      }
    }
    AlgebriteInterface.setup_algebrite();
    let result_expr = mode === 'bothsides' ?
        AlgebriteInterface.call_function_bothsides(function_name, argument_exprs) :
        AlgebriteInterface.call_function(function_name, argument_exprs);
    if(result_expr) {
      // Special-case handling to reformat the output of roots(), nroots() commands.
      if(function_name === 'roots' || function_name === 'nroots')
        result_expr = this._format_algebrite_roots_result(
          argument_exprs[1], result_expr);
      return new_stack.push_expr(result_expr);
    }
    return this.error_flash_stack();
  }
  // Change the output of an Algebrite roots() or nroots() command
  // from a vector of root values to a more descriptive aligned
  // environment array expression.
  _format_algebrite_roots_result(variable_expr, roots_matrix_expr) {
    if(!(roots_matrix_expr.is_matrix_expr() &&
         roots_matrix_expr.column_count === 1))
      return roots_matrix_expr;  // shouldn't happen
    let output_exprs = [];
    for(const [row, row_exprs]
        of roots_matrix_expr.element_exprs.entries()) {
      const root_expr = row_exprs[0];
      output_exprs.push(InfixExpr.combine_infix(
        variable_expr.with_subscript(TextExpr.integer(row+1), false /* no parenthesize */),
        RationalizeToExpr.rationalize_expr(root_expr, false),
        new TextExpr('=')));
    }
    return new ArrayExpr(
      'aligned', output_exprs.length, 3,
      ArrayExpr.split_elements(output_exprs, 'infix'));
  }

  // NOTE: This has to be done specially because otherwise Algebrite will
  // automatically just resimplify the "factored" result.
  do_algebrite_completesquare(stack, guess_variable) {
    let [new_stack, expr, variable_expr] = [null, null, null];
    if(guess_variable === 'true') {
      [new_stack, expr] = stack.pop_exprs(1);
      const [/*guessed_variable_name*/, guessed_variable_expr] =
            AlgebriteInterface.guess_variable(expr);
      variable_expr = guessed_variable_expr;
      if(!variable_expr) {
        this.report_error('Could not guess variable');
        return this.error_flash_stack();
      }
    }
    else
      [new_stack, expr, variable_expr] = stack.pop_exprs(2);
    AlgebriteInterface.setup_algebrite();
    const result_expr =
          AlgebriteInterface.complete_square(expr, variable_expr);
    return new_stack.push_expr(result_expr);
  }

  // Try to verify an equality or other relational expression
  // such as 'sin(x) < x'.
  // If 'include_range' is set, take 3 arguments from the
  // stack: eqn mean stddev.  Sample variable values from a normal
  // distribution N(mean, stddev).  Otherwise, only 1 argument from the
  // stack is taken and N(0, 10) is assumed.
  do_algebrite_check(stack, include_range) {
    let new_stack, exprs, expr;
    let mean = 0.0, stddev = 10.0;
    if(include_range === 'true') {
      [new_stack, ...exprs] = stack.pop_exprs(3);
      expr = exprs[0];
      const get_value = expr => {
        if(expr.is_text_expr_with_number()) {
          const x = parseFloat(expr.text);
          return isNaN(x) ? null : x;
        }
        else return null;
      };
      mean = get_value(exprs[1]);
      stddev = get_value(exprs[2]);
      if(mean === null || stddev === null)
        return this.error_flash_stack();
    }
    else
      [new_stack, expr] = stack.pop_exprs(1);
    const result = AlgebriteInterface.check_relation(
      expr, {
        'time_limit': 2000.0,  // milliseconds
        'iteration_limit': 100,
        'mean': mean, 'stddev': stddev
      });
    const result_text = this._format_algebrite_check_result(result, mean, stddev);
    return new_stack.push_expr(expr).push(result_text);
  }
  _format_algebrite_check_result(result, mean, stddev) {
    let show_variable_value = false, show_distribution = false;
    let pieces = ['**', result.result, '**.'];
    if(result.message)
      pieces.push(' ', result.message, '.');
    if(!result.exact && result.tries) {
      pieces.push(
        ' Checked ', result.tries.toString(),
        ' point' + (result.tries === 1 ? '' : 's'), ' in [].');
      show_distribution = true;
      if(result.false_for !== undefined && result.variable !== undefined) {
        pieces.push(' False for [] = ', result.false_for, '.');
        show_variable_value = true;
      }
    }
    let result_item = TextItem.parse_string(pieces.join(''));
    if(show_distribution)
      result_item = result_item.try_substitute_placeholder(
        new FunctionCallExpr(
          FontExpr.wrap(new TextExpr('N')).with_typeface('calligraphic'),
          DelimiterExpr.parenthesize(
            InfixExpr.combine_infix(
              double_to_expr(mean), double_to_expr(stddev),
              new TextExpr(',')))));
    if(show_variable_value)
      result_item = result_item.try_substitute_placeholder(result.variable);
    return result_item;
  }

  do_rationalize(stack) {
    const [new_stack, expr] = stack.pop_exprs(1);
    const result_expr = RationalizeToExpr.rationalize_expr(expr);
    return new_stack.push_expr(result_expr);
  }

  do_prefix_argument() {
    const key = this.last_keypress;
    this.suppress_undo();
    this.switch_to_mode(this.mode);  // preserve current mode
    this.preserve_prefix_argument = true;
    let new_prefix_argument = null;
    if(/^[0-9]$/.test(key)) {
      const value = parseInt(key);
      if(this.prefix_argument !== null && this.prefix_argument > 0) {
        // Multi-digit prefix argument.
        new_prefix_argument = 10*this.prefix_argument + value;
      }
      else new_prefix_argument = value;
      // Cap maximum value to avoid possible pathological cases (loops, etc).
      new_prefix_argument = Math.min(9999, new_prefix_argument);
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
    const [new_stack, ] = stack.pop(arg);
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
  // Default argument of 2 is: a b => b a b
  // Argument of 1 acts as "dup".
  do_tuck(stack) {
    const arg = this._get_prefix_argument(2, stack.depth());
    const [new_stack, ...items] = stack.pop(arg);
    if(items.length > 0) {
      const last_item = items[items.length-1];
      return new_stack.push_all([last_item.clone()].concat(items));
    }
    else
      return new_stack;
  }

  // Pick the Nth item from the stack and copy it to the stack top.
  // Default argument of 2 is: a b => a b a
  do_over(stack) {
    const arg = this._get_prefix_argument(2, stack.depth());
    const [new_stack, ...items] = stack.pop(arg);
    if(items.length > 0)
      return new_stack.push_all(items.concat([items[0].clone()]));
    else
      return new_stack;
  }

  // Rotate N top stack items (default=3: a b c => b c a)
  do_rot(stack) {
    const arg = this._get_prefix_argument(3, stack.depth());
    const [new_stack, ...items] = stack.pop(arg);
    if(items.length > 0) {
      const new_items = items.slice(1).concat([items[0]]);
      return new_stack.push_all(new_items);
    }
    else
      return new_stack;
  }

  // Rotate N top stack items backwards (default=3: a b c => c a b)
  do_unrot(stack) {
    const arg = this._get_prefix_argument(3, stack.depth());
    const [new_stack, ...items] = stack.pop(arg);
    if(items.length > 0) {
      const new_items = items.slice(-1).concat(items.slice(0, -1));
      return new_stack.push_all(new_items);
    }
    else
      return new_stack;
  }

  // Remove all but the top N stack items (default=1).
  do_keep(stack) {
    const arg = this._get_prefix_argument(1, stack.depth());
    const [new_stack, ...items] = stack.pop(arg);
    return new_stack.pop(new_stack.depth())[0].push_all(items);
  }

  // amount_string: integer or 'top'/'bottom'
  do_change_document_selection(stack, amount_string) {
    this.suppress_undo();
    if(this.settings.dock_helptext) {
      // When the helptext is docked, treat 'change document selection' commands
      // as scrolling the helptext instead.  Do an ad-hoc conversion from number
      // of items scrolled to percentage of panel height scrolled.
      const percentage_string =
            ['top', 'bottom'].includes(amount_string) ? amount_string :   
            parseInt(amount_string) > 3 ? '75' : parseInt(amount_string) < -3 ? '-75' :
            parseInt(amount_string) > 0 ? '25' : '-25';
      return this.do_scroll(
        stack, 'document_panel', 'vertical', percentage_string);
    }
    else {
      const document = this.app_state.document;
      const amount =
            amount_string === 'top' ? -document.item_count() :
            amount_string === 'bottom' ? document.item_count() :
            parseInt(amount_string);
      this.update_document(document.move_selection_by(amount));
      return stack;
    }
  }

  // amount_string: integer or 'top'/'bottom'
  do_shift_document_selection(stack, amount_string) {
    // Ignore these commands while the helptext is docked (the document contents
    // are obscured so this is probably a user mistake).
    if(this.settings.dock_helptext)
      return stack;
    const document = this.app_state.document;
    const amount =
          amount_string === 'top' ? 1 - document.selection_index :
          amount_string === 'bottom' ? document.item_count() - document.selection_index :
          parseInt(amount_string);
    const new_document = document.shift_selection_by(amount);
    if(new_document)
      return this.update_document(new_document);
    else
      return this.error_flash_document();
  }

  do_save_file(stack) {
    const file_manager = this.app_component.state.file_manager;
    const filename = file_manager.current_filename;
    const save_result = file_manager.save_file(filename, this.app_state);
    if(save_result)
      this.notify('Error saving ' + filename + ': ' + save_result);
    else {
      this.change_selected_filename(filename);
      this.notify('Saved: ' + filename);
      this.perform_undo_or_redo = 'clear';
      this.file_saved_or_loaded = true;
    }
    return stack;
  }

  // TODO: factor with do_save_file
  do_save_file_as(stack) {
    const file_manager = this.app_component.state.file_manager;
    let new_filename = window.prompt(
      'Enter the filename to save as',
      file_manager.generate_unused_filename(file_manager.current_filename));
    if(!new_filename)
      return stack;  // cancel
    new_filename = file_manager.sanitize_filename(new_filename);
    if(!new_filename) {
      alert('Invalid filename (must only contain letters, numbers and underscores)');
      return stack;
    }
    const save_result = file_manager.save_file(new_filename, this.app_state);
    if(save_result)
      this.notify('Error saving ' + new_filename + ': ' + save_result);
    else {
      this.notify('Saved as: ' + new_filename);
      file_manager.current_filename = new_filename;
      this.settings.last_opened_filename = new_filename;
      file_manager.save_settings(this.settings);
      this.change_selected_filename(new_filename);
      this.perform_undo_or_redo = 'clear';
      this.file_saved_or_loaded = true;
    }
    return stack;
  }

  do_rename_selected_file(stack) {
    const file_manager = this.app_component.state.file_manager;
    const old_filename = file_manager.current_filename;
    if(!old_filename)
      return this.notify('No file selected to rename');
    const new_filename_unsanitized = window.prompt(
      ['Enter a new filename for "', old_filename, '":'].join(''));
    if(!new_filename_unsanitized) return stack;
    const new_filename = file_manager.sanitize_filename(new_filename_unsanitized);
    if(!new_filename) {
      alert('Invalid new filename (must only contain letters, numbers and underscores)');
      return stack;
    }
    const rename_result = file_manager
          .rename_file(old_filename, new_filename);
    if(rename_result)
      return this.notify(rename_result);
    this.change_selected_filename(new_filename);
    if(file_manager.current_filename === old_filename) {
      // Renaming the currently active file; point at the new one.
      file_manager.current_filename = new_filename;
      this.settings.last_opened_filename = new_filename;
      file_manager.save_settings(this.settings);
    }
    this.notify(['Renamed: ', old_filename, ' -> ', new_filename].join(''));
    this.perform_undo_or_redo = 'clear';
    this.file_saved_or_loaded = true;
    return stack;
  }

  do_load_selected_file(stack) {
    let file_manager = this.app_component.state.file_manager
    const filename = file_manager.selected_filename;
    if(!filename)
      return this.error_flash_document();
    if(this.app_state.is_dirty &&
       window.confirm("The current document has unsaved changes.  Save it now?")) {
      this.do_save_file(stack);
      if(!this.file_saved_or_loaded)
        return stack;  // save failed
    }
    const new_app_state = file_manager.load_file(filename);
    if(new_app_state) {
      file_manager.selected_filename = file_manager.current_filename = filename;
      this.settings.last_opened_filename = filename;
      file_manager.save_settings(this.settings);
      this.notify('Loaded: ' + filename);
      this.perform_undo_or_redo = 'clear';
      this.file_saved_or_loaded = true;
      this.do_toggle_popup(new_app_state.stack, 'files');  // close file manager
      this.update_document(new_app_state.document);
      return new_app_state.stack;
    }
    else {
      this.notify('Could not load ' + filename);
      return stack;
    }
  }

  do_export_selected_file(stack) {
    const file_manager = this.app_component.state.file_manager;
    const filename = file_manager.selected_filename;
    if(!filename) {
      this.report_error('No file selected to export');
      return stack;
    }
    const base64_string = file_manager.fetch_file_base64(filename);
    if(!base64_string) {
      this.report_error('Could not load file to export');
      return stack;
    }
    // Send the file by creating a temporary <a> element and clicking it.
    const blob = new Blob([base64_string]);  // TODO: MIME type
    const anchor_elt = document.createElement('a');
    const file_url = URL.createObjectURL(blob);
    anchor_elt.href = file_url;
    anchor_elt.download = filename + '.rpn';
    document.body.appendChild(anchor_elt);
    anchor_elt.click();
    setTimeout(() => {
      document.body.removeChild(anchor_elt);
      URL.revokeObjectURL(file_url);
    }, 0);
    return stack;
  }

  do_start_new_file(stack) {
    let file_manager = this.app_component.state.file_manager;
    let new_filename = file_manager.generate_unused_filename(
      file_manager.current_filename || 'untitled');
    if(this.app_state.is_dirty &&
       window.confirm("The current document has unsaved changes.  Save it now?")) {
      this.do_save_file(stack);
      if(!this.file_saved_or_loaded)
        return stack;  // save failed
    }
    new_filename = window.prompt('Enter a filename for the new document', new_filename);
    if(!new_filename) return;
    new_filename = file_manager.sanitize_filename(new_filename || '');
    if(!new_filename) {
      alert('Invalid filename (must only contain letters, numbers and underscores)');
      return stack;
    }
    if(file_manager.has_file_named(new_filename)) {
      alert('A file named ' + new_filename + ' already exists.');
      return stack;
    }
    // This basically works like loading from a blank file.
    // The new file with its initial contents is saved immediately.
    const new_state = new AppState();
    const settings = this.settings;
    file_manager.save_file(new_filename, new_state);  // ignore errors saving new file
    settings.last_opened_filename = file_manager.current_filename = new_filename;
    file_manager.save_settings(settings);
    this.change_selected_filename(new_filename);
    this.notify('Started new file: ' + new_filename);
    this.perform_undo_or_redo = 'clear';
    this.file_saved_or_loaded = true;
    this.do_toggle_popup(new_state.stack, 'files');  // close file manager
    this.update_document(new_state.document);
    return new_state.stack;
  }

  do_select_adjacent_file(stack, offset_string) {
    const offset = parseInt(offset_string);
    const file_manager = this.app_component.state.file_manager;
    const new_selected_filename = file_manager.select_adjacent_filename(offset);
    this.change_selected_filename(new_selected_filename);
  }

  do_delete_selected_file(stack) {
    const file_manager = this.app_component.state.file_manager;
    const filename = file_manager.selected_filename;
    if(!filename) return this.error_flash_document();
    if(!window.confirm("Really delete \"" + filename + "\"?")) return;
    const result = file_manager.delete_file(filename);
    if(result) {
      // Error deleting file.
      this.notify(result);
    }
    else {
      this.notify('Deleted: ' + filename);
      this.files_changed = true;
    }
    return stack;
  }

  do_delete_all_files(stack) {
    const file_manager = this.app_component.state.file_manager;
    if(!(window.confirm("Really delete ALL files?  This cannot be undone, make sure to export anything you want to keep first.")
         && window.confirm("Please confirm once more that you want to delete all files.")))
      return stack;
    file_manager.delete_all_files();
    this.notify('All files deleted');
    this.files_changed = true;
    // NOTE: The current filename (document in memory) is still preserved,
    // so saving immediately with do_save_file() will recreate the current file.
    this.change_selected_filename(null);
    return stack;
  }

  // If 'preserve' is set, items are kept on the stack after copying them
  // into the document.  Otherwise, the items are removed from the stack.
  do_pop_to_document(stack, preserve) {
    const arg = this._get_prefix_argument(1, stack.depth());
    const [new_stack, ...items] = stack.pop(arg);
    const new_items = items.map(item => item.clone());
    const new_document = this.app_state.document.insert_items(new_items);
    this.update_document(new_document);
    return preserve ? stack : new_stack;
  }

  do_extract_from_document(stack, preserve) {
    const document = this.app_state.document;
    const item_count = this._get_prefix_argument(1, document.items.length);
    if(document.selection_index < item_count)
      return this.error_flash_document();  // not enough items available at/above selection
    const [new_document, deleted_items] = document.delete_selection(item_count);
    const new_items = deleted_items.map(item => item.clone());
    if(!preserve)
      this.update_document(new_document);
    return stack.push_all(new_items);
  }

  // Clear stack and document.
  do_reset_all(/*stack*/) {
    this.notify("Stack and document cleared");
    this.update_document(new Document());
    return new Stack();
  }

  // Put something on the stack.  If 'text' starts with \, it becomes
  // a CommandExpr (a LaTeX command), otherwise it will be a plain TextExpr.
  do_push(stack, text) {
    return stack.push_expr(Expr.text_or_command(
      text || '' /* handle 'push nothing' case */));
  }

  do_push_last_keypress(stack) {
    return this.do_push(stack, this.last_keypress);
  }

  do_push_placeholder(stack) {
    return stack.push_expr(new PlaceholderExpr());
  }

  do_push_separator(stack) {
    return stack.push(TextItem.separator_item());
  }

  // Like do_push, but use a PrefixExpr('-') for negative integers.
  do_integer(stack, integer_string) {
    return stack.push_expr(TextExpr.integer(integer_string));
  }

  // Used for \mathscr, \mathcal, \mathbb, which only have uppercase glyphs.
  // Stack top should be an ExprItem with a simple TextExpr.
  do_uppercase(stack) {
    const [new_stack, expr] = stack.pop_exprs(1);
    if(expr.is_text_expr())
      return new_stack.push_expr(
        new TextExpr(expr.text.toUpperCase()));
    else return stack;
  }

  // Pop arity_string items and turn them into an CommandExpr.
  do_operator(stack, opname, arity_string = '1') {
    const arity = parseInt(arity_string);
    const [new_stack, ...popped_exprs] = stack.pop_exprs(arity);
    const result_expr = new CommandExpr(opname, popped_exprs)
    return new_stack.push_expr(result_expr);
  }

  // Shortcut for 'operator frac 2'.
  do_fraction(stack) {
    const [new_stack, numerator_expr, denominator_expr] = stack.pop_exprs(2);
    return new_stack.push_expr(
      CommandExpr.frac(numerator_expr, denominator_expr));
  }

  // Set the typeface of the stack top, wrapping it in a FontExpr if it's not already.
  // If there is already a typeface set on the expr, it's replaced with the new one
  // (but the bold flag and any size adjustments are kept).
  do_typeface(stack, typeface) {
    let [new_stack, expr] = stack.pop_exprs(1);
    // Some command+typeface combinations are not supported or require conversion.
    if(expr.is_command_expr_with(0)) {
      const command_name = FontExpr.
            check_typeface_support_for_command(typeface, expr.command_name);
      if(command_name === false)
        return stack;  // don't do anything
      else expr = new CommandExpr(command_name);
    }
    const font_expr = FontExpr.wrap(expr).with_typeface(typeface);
    return new_stack.push_expr(font_expr.unwrap_if_possible());
  }

  // Increase or decrease the size of an expression via commands like \large and \small.
  // operation:
  //   'larger' or 'smaller': increase or decrease in steps of +/- 1.
  //   Limit is -4 <= size <= 5.
  do_adjust_size(stack, operation) {
    const delta = operation === 'larger' ? +1 : -1;
    const [new_stack, expr] = stack.pop_exprs(1);
    const font_expr = FontExpr.wrap(expr);
    const new_expr = font_expr.with_size_adjustment(font_expr.size_adjustment + delta);
    return new_stack.push_expr(new_expr.unwrap_if_possible());
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
    if(this.settings.autoparenthesize)
      arg_expr = DelimiterExpr.parenthesize_for_argument(arg_expr);
    // \sech and \csch are are missing in LaTeX for some reason so they need to be special cased here.
    let expr;
    if(orig_funcname === 'sech' || orig_funcname === 'csch')
      expr = new CommandExpr('operatorname', [new TextExpr(funcname), arg_expr]);
    else
      expr = new CommandExpr(funcname, [arg_expr]);
    return new_stack.push_expr(expr);
  }

  // Create a differential form infix expression like: dx ^ dy ^ dz.
  // degree_string is the number of differential elements to combine:
  //   degree_string='0' creates a lone 'd'.
  //   degree_string='1' creates the usual 'dx'.
  //   degree_string>='2' combines the differentials with \wedge into an InfixExpr.
  // typeface='roman' typesets the 'd' with \mathrm.
  // Unary minus signs are pulled out into the differential, e.g. -x -> -dx,
  // and the 'x' expressions are autoparenthesized if the autoparenthesization mode is on.
  do_differential_form(stack, degree_string, typeface = null) {
    const degree = parseInt(degree_string);
    const d_expr = typeface === 'roman' ?
          FontExpr.roman_text('d') : new TextExpr('d');
    const [new_stack, ...exprs] = stack.pop_exprs(degree);
    if(degree === 0)  // special case
      return new_stack.push_expr(d_expr);
    const dx_exprs = exprs.map(expr => {
      let is_negated = false;
      let base_expr = expr;
      if(expr.is_unary_minus_expr()) {
        is_negated = true;
        base_expr = expr.base_expr;
      }
      if(this.settings.autoparenthesize)
        base_expr = DelimiterExpr.autoparenthesize(base_expr);
      let dx_expr = Expr.concatenate(d_expr, base_expr);
      if(is_negated)
        dx_expr = PrefixExpr.unary_minus(dx_expr);
      return dx_expr;
    });
    const form_expr = InfixExpr.combine_infix_all(dx_exprs, new CommandExpr('wedge'));
    return new_stack.push_expr(form_expr);
  }

  // Similar to do_operator, except:
  //   - If the object the hat is being added to is a literal 'i' or 'j',
  //     it's first converted into a \imath or \jmath to remove the dot
  //     before applying the hat.
  //   - Adding a hat to a subscripted/superscripted expression instead applies
  //     it to the base expression, for better horizontal positioning.
  //   - If the 'base' expression itself is also subscripted/superscripted, this rule
  //     is applied recursively: j^2^3 -> \jmath^2^3 (but (j^2)^3 is left alone).
  //   - FontExprs are also examined recursively, but only if they're normal math
  //     typeface (no roman font, etc).  They can still be bolded and/or resized.
  //       \bold{j}   => \bold{\hat{\jmath}}
  //       \bold{j^2} => \bold{\hat{\jmath}^2}
  //       \bold{j}^2 => \bold{\hat{\jmath}}^2
  //       \mathrm{j} => \hat{\mathrm{j}}
  // TODO: maybe have an option to disable this behavior
  // NOTE: This only applies to "small" hats; commands like \widehat don't
  // get this treatment.
  do_apply_hat(stack, hat_op) {
    let [new_stack, expr] = stack.pop_exprs(1);
    return new_stack.push_expr(this._do_apply_hat(expr, hat_op));
  }
  _do_apply_hat(expr, hat_op) {
    if(expr.is_text_expr_with('i') || expr.is_text_expr_with('j'))
      return new CommandExpr(
        hat_op,
        [new CommandExpr(
          expr.is_text_expr_with('i') ? 'imath' : 'jmath')]);
    else if(expr.is_subscriptsuperscript_expr())
      return expr.replace_subexpression(
        0 /* expr.base_expr */,
        this._do_apply_hat(expr.base_expr, hat_op));
    else if(expr.is_font_expr() && expr.typeface === 'normal')
      return expr.replace_subexpression(
        0 /* expr.expr */,
        this._do_apply_hat(expr.expr /* NOTE: not expr.base_expr */, hat_op));
    else
      return new CommandExpr(hat_op, [expr]);
  }

  // Wrap expr in \htmlClass{...}
  // If it's already wrapped in the given class, unwrap it instead.
  // If class_name_2 is also provided, this cycles between:
  //    nothing -> class_name -> class_name_2 -> nothing
  do_html_class(stack, class_name, class_name_2) {
    let [new_stack, expr] = stack.pop_exprs(1);
    let new_class_name = null;
    if(expr.is_command_expr_with(2, 'htmlClass') &&
       expr.operand_exprs[0].is_text_expr()) {
      // It's already wrapped in \htmlClass
      if(expr.operand_exprs[0].text === class_name)
        new_class_name = class_name_2;  // might be null
      expr = expr.operand_exprs[1];  // strip existing \htmlClass
    }
    else
      new_class_name = class_name;
    if(new_class_name)
      expr = new CommandExpr('htmlClass', [new TextExpr(new_class_name), expr]);
    return new_stack.push_expr(expr);
  }

  do_make_bold(stack) {
    const [new_stack, item] = stack.pop(1);
    return new_stack.push(item.as_bold());
  }

  // side: 'left' or 'right'
  // If there is a DelimiterExpr on the stack, the corresponding delimiter side
  // is adjusted to be 'delimiter_type'.  Other expression types are wrapped in
  // a DelimiterExpr with a 'blank' on the opposite side.
  do_modify_delimiter(stack, delimiter_type, side) {
    const [new_stack, expr] = stack.pop_exprs(1);
    let new_expr = expr;
    if(expr.is_delimiter_expr())
      new_expr = new DelimiterExpr(
        side === 'left' ? delimiter_type : expr.left_type,
        side === 'right' ? delimiter_type : expr.right_type,
        expr.inner_expr,
        expr.fixed_size);
    else if(delimiter_type !== '.')
      new_expr = new DelimiterExpr(
        side === 'left' ? delimiter_type : '.',
        side === 'right' ? delimiter_type : '.',
        expr);
    return new_stack.push_expr(new_expr);
  }

  do_toggle_fixed_size_delimiters(stack) {
    const [new_stack, expr] = stack.pop_exprs(1);
    if(expr.is_delimiter_expr())
      return new_stack.push_expr(expr.as_fixed_size(!expr.fixed_size));
    else
      stack.type_error();
  }

  do_remove_delimiters(stack) {
    const [new_stack, expr] = stack.pop_exprs(1);
    if(expr.is_delimiter_expr())
      return new_stack.push_expr(expr.inner_expr);
    else
      return stack;  // not considered an error
  }

  // Combine two Text or Expr items with an infix operator.
  // 'opname' can be either a \latex_command or a regular string like '+'
  // The cases of Expr+Expr and Expr+Text (or Text+Text) are handled separately.
  do_infix(stack, opname) {
    const [new_stack, left_item, right_item] = stack.pop(2);
    if(left_item.is_expr_item() && right_item.is_expr_item()) {
      // Expr+Expr (the usual case).
      const new_expr = InfixExpr.combine_infix(
        left_item.expr, right_item.expr,
        Expr.text_or_command(opname));
      return new_stack.push_expr(new_expr);
    }
    else if((left_item.is_expr_item() || left_item.is_text_item()) &&
            (right_item.is_expr_item() || right_item.is_text_item())) {
      // Expr+Text or Text+Expr or Text+Text.
      const new_item = TextItem.concatenate_items(left_item, right_item, opname);
      return new_stack.push(new_item);
    }
    else
      return stack.type_error();
  }

  // Take (left, right, operator) from the stack and create an InfixExpr.
  do_apply_infix(stack) {
    let [new_stack, left_expr, right_expr, operator_expr] = stack.pop_exprs(3);
    const new_expr = InfixExpr.combine_infix(left_expr, right_expr, operator_expr);
    return new_stack.push_expr(new_expr);
  }

  // Similar to do_infix but joins two expressions with an English phrase
  // with Roman font and extra spacing (\quad).
  do_conjunction(stack, phrase) {
    const [new_stack, left_expr, right_expr] = stack.pop_exprs(2);
    const new_expr = Expr.combine_with_conjunction(
      left_expr, right_expr,
      phrase.replaceAll('_', ' '),
      false);
    return new_stack.push_expr(new_expr);
  }

  // Swap parts of an expression, if possible:
  //   - InfixExprs swap their left and right sides at the split_at_index operator.
  //   - Fractions (both "normal" and flex-mode inline) swap numerator and denominator.
  //   - TensorExprs swap their left and right indices.
  //   - SubscriptSuperscriptExpr swap their subscripts and superscripts.
  //   - PostfixExprs become PrefixExprs and vice-versa.
  do_swap_pieces(stack) {
    const [new_stack, expr] = stack.pop_exprs(1);
    let new_expr = null;
    if(expr.is_infix_expr())
      new_expr = expr.swap_sides_at(expr.split_at_index);
    else if(expr.is_command_expr_with(2, 'frac')) {
      // "Normal" fraction.
      new_expr = CommandExpr.frac(
        expr.operand_exprs[1],
        expr.operand_exprs[0]);
    }
    else if(expr.is_delimiter_expr() && expr.is_flex_inline_fraction()) {
      // Flex-mode inline fraction.
      new_expr = new DelimiterExpr(
        '.', '.',
        new InfixExpr(
          [expr.inner_expr.operand_exprs[1], expr.inner_expr.operand_exprs[0]],
          expr.inner_expr.operator_exprs),
        expr.fixed_size);
    }
    else if(expr.is_tensor_expr())
      new_expr = expr.swap_left_and_right();
    else if(expr.is_subscriptsuperscript_expr())
      new_expr = new SubscriptSuperscriptExpr(
        expr.base_expr, expr.superscript_expr, expr.subscript_expr);
    else if(expr.is_postfix_expr())
      new_expr = new PrefixExpr(expr.base_expr, expr.operator_expr);
    else if(expr.is_prefix_expr())
      new_expr = new PostfixExpr(expr.base_expr, expr.operator_expr);
    if(new_expr)
      return new_stack.push_expr(new_expr);
    else
      return this.error_flash_stack();
  }

  // Make a line break at the current split_at_index of the stack top InfixExpr.
  // Cycles between:
  //   - No line break at split_at_index operator
  //   - Line break after the split_at_index
  //   - Line break before the operator
  do_infix_linebreak(stack) {
    const [new_stack, infix_expr] = stack.pop_exprs(1);
    if(!infix_expr.is_infix_expr())
      return stack.type_error();
    const index_before = 2*infix_expr.split_at_index;
    const index_after = index_before+1;
    let new_expr;
    if(infix_expr.has_linebreak_at(index_after))
      new_expr = infix_expr.without_linebreak_at(index_after).with_linebreak_at(index_before);
    else if(infix_expr.has_linebreak_at(index_before))
      new_expr = infix_expr.without_linebreak_at(index_before);
    else
      new_expr = infix_expr.with_linebreak_at(index_after);
    return new_stack.push_expr(new_expr);
  }

  // Concatenate two Expr or Text items.  This is the basic concatenation action.
  // If 'autoparenthesize' is 'false', autoparenthesization is inhibited,
  // otherwise the behavior depends on the global settings.
  // (Default is to always autoparenthesize).
  do_concat(stack, autoparenthesize) {
    const [new_stack, left_item, right_item] = stack.pop(2);
    const no_parenthesize = autoparenthesize === 'false' ||
          !this.settings.autoparenthesize;
    if(left_item.is_expr_item() && right_item.is_expr_item())
      return new_stack.push_expr(
        Expr.concatenate(
          left_item.expr, right_item.expr, no_parenthesize));
    else if((left_item.is_expr_item() || left_item.is_text_item()) &&
            (right_item.is_expr_item() || right_item.is_text_item()))
      return new_stack.push(
        TextItem.concatenate_items(left_item, right_item));
    else
      return stack.type_error();
  }

  // Combine a function name and its argument tuple into a FunctionCallExpr.
  // The arguments must already exist as a DelimiterExpr, e.g. (x,y).
  do_function_call(stack) {
    const [new_stack, fn_expr, args_expr] = stack.pop_exprs(2);
    if(args_expr.is_delimiter_expr())
      return new_stack.push_expr(
        new FunctionCallExpr(fn_expr, args_expr));
    else
      return stack.type_error();
  }

  do_prefix(stack, operator_text) {
    const [new_stack, base_expr] = stack.pop_exprs(1);
    const new_expr = new PrefixExpr(
      base_expr, Expr.text_or_command(operator_text));
    return new_stack.push_expr(new_expr);
  }

  // Shortcut for "prefix -", to make the keymap cleaner.
  do_negate(stack) { return this.do_prefix(stack, '-'); }

  // Substitute the stack top expression into the first available placeholder marker in the
  // item second from top.  That (second) item can be either an ExprItem or TextItem.
  do_substitute_placeholder(stack) {
    const [new_stack, substitution_expr] = stack.pop_exprs(1);
    const [new_stack_2, item] = new_stack.pop(1);
    if(item.is_expr_item()) {
      const original_expr = item.expr;
      const placeholder_expr_path = original_expr
            .find_placeholder_expr_path();
      if(placeholder_expr_path !== null) {
        const new_expr = placeholder_expr_path
              .replace_selection(substitution_expr);
        return new_stack_2.push_expr(new_expr);
      }
    }
    else if(item.is_text_item()) {
      const new_text_item = item
            .try_substitute_placeholder(substitution_expr);
      if(new_text_item)
        return new_stack_2.push(new_text_item);
    }
    return stack.type_error();
  }

  // x y z => new_x, with expressions matching 'y' replaced by 'z'.
  do_substitute(stack) {
    const [new_stack, expr, search_expr, substitution_expr] = stack.pop_exprs(3);
    const result_expr = expr.substitute(search_expr, substitution_expr);
    return new_stack.push_expr(result_expr);
  }

  // Extract either the left or right side of an expression.
  //   - InfixExpr yields the part to the left or right of the split_at_index point.
  //   - CommandExpr \frac yields the numerator or denominator of the fraction.
  //   - Flex-mode inline fractions (empty delimiter infix with '/' operator)
  //     also yield their numerator or denominator.
  //   - PrefixExpr/PostfixExpr yields the operator or base expression (undocumented).
  do_extract_side(stack, which_side) {
    const [new_stack, expr] = stack.pop_exprs(1);
    let extracted_expr = null;
    if(expr.is_infix_expr())
      extracted_expr = expr.extract_side_at(expr.split_at_index, which_side);
    else if(expr.is_command_expr_with(2, 'frac'))
      extracted_expr = expr.operand_exprs[which_side === 'right' ? 1 : 0];
    else if(expr.is_delimiter_expr() && expr.is_flex_inline_fraction())
      extracted_expr = expr.inner_expr.operand_exprs[which_side === 'right' ? 1 : 0];
    else if(expr.is_prefix_expr())
      extracted_expr = which_side === 'right' ? expr.base_expr : expr.operator_expr;
    else if(expr.is_postfix_expr())
      extracted_expr = which_side === 'right' ? expr.operator_expr : expr.base_expr;
    else
      return stack.type_error();
    return new_stack.push_expr(extracted_expr);
  }

  // Attempt to "negate" a comparison operator like '=' (resulting in \neq).
  // If the operator is already negated, the negation is removed if possible.
  // Using this command on an InfixExpr will try to negate the operator
  // at its split_at_index point.
  do_negate_comparison(stack) {
    const [new_stack, expr] = stack.pop_exprs(1);
    const negated_expr = expr.as_logical_negation();
    if(negated_expr)
      return new_stack.push_expr(negated_expr);
    else
      return stack.type_error();
  }

  // For an equation or relational expression like x^2 + x < 3,
  // subtract the right hand side from the left, leaving x^2 + x - 3 < 0.
  // If the expression is not an equation, it's left alone.
  // If 'drop_rhs' is set, leave out the "< 0" part.
  do_all_on_left(stack, drop_rhs) {
    const [new_stack, expr] = stack.pop_exprs(1);
    if(!expr.is_infix_expr())
      return stack;
    let relation_index = null;
    let relational_op_expr = null;
    let more_than_one_relational_op = false;
    for(const [i, operator_expr] of expr.operator_exprs.entries()) {
      if(['=', '<', '>', 'ne', 'le', 'ge'
         ].includes(expr.operator_text_at(i))) {
        if(relation_index === null) {
          relation_index = i;
          relational_op_expr = operator_expr;
        }
        else
          more_than_one_relational_op = true;
      }
    }
    if(more_than_one_relational_op || relation_index === null)
      return stack;
    const lhs = expr.extract_side_at(relation_index, 'left');
    const rhs = expr.extract_side_at(relation_index, 'right');
    if(rhs.is_text_expr_with('0')) {
      // Already in the form x=0.
      if(drop_rhs === 'true')
        return new_stack.push_expr(lhs);
      else
        return stack;
    }
    const new_lhs = InfixExpr.combine_infix(lhs, rhs, new TextExpr('-'));
    const new_expr = (drop_rhs === 'true') ? new_lhs :
          InfixExpr.combine_infix(
            new_lhs, TextExpr.integer(0),
            relational_op_expr);
    return new_stack.push_expr(new_expr);
  }

  // Take apart an Expr and put all its elements on the stack.
  do_dissolve(stack) {
    const [new_stack, expr] = stack.pop_exprs(1);
    return new_stack.push_all_exprs(expr.dissolve());
  }

  do_start_text_entry(stack, text_entry_mode, initial_text) {
    // Special cases:
    //   conjunction_entry mode: make sure there are two expressions on the stack beforehand.
    //   tag_entry: make sure there is one expression or text item.
    if((text_entry_mode === 'conjunction_entry' && !stack.check_exprs(2)) ||
       (text_entry_mode === 'tag_entry' && !(
         stack.check(1) &&
           ['expr', 'text'].includes(stack.peek(1).item_type()))))
      return this.error_flash_stack();
    this.text_entry = new TextEntryState(text_entry_mode, initial_text);
    this.switch_to_mode(text_entry_mode);
    this.suppress_undo();
    return stack;
  }

  do_cancel_text_entry(stack) {
    this.suppress_undo();
    return this._cancel_text_entry(stack);
  }

  _cancel_text_entry(stack) {
    const edited_item = this.text_entry.edited_item;
    this.text_entry = null;
    if(edited_item)
      return stack.push(edited_item);
    else
      return stack;
  }

  do_text_entry_move_cursor(stack, move_type) {
    this.suppress_undo();
    this.switch_to_mode(this.mode);
    this.text_entry.move(move_type);
    return stack;
  }

  do_append_text_entry(stack) {
    const key = this.last_keypress;
    this.suppress_undo();
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
      else if(this.text_entry.mode === 'math_entry' &&
              key === "\\" && this.text_entry.is_empty()) {
        // Switch from math_entry -> latex_entry
        // when entering as '\' as the first character.
        return this.do_start_text_entry(stack, 'latex_entry', '');
      }
      this.text_entry.insert(key);
    }
    return stack;
  }

  // If new_mode_when_empty is provided, switch to that mode if this
  // backspace was done while the text field is empty.  This is currently
  // used to switch back from latex entry mode to normal math entry mode.
  // 'backspace_type' can be 'backspace' or 'delete'.
  do_text_entry_backspace(stack, backspace_type, new_mode_when_empty) {
    if(this.text_entry.is_empty()) {
      // Everything has been deleted; cancel text entry.
      // Note that when cancelling via backspace this way, even if
      // there was a text_entry_edited_item, it's discarded.
      this._cancel_text_entry(stack);
      if(new_mode_when_empty) {
        this.text_entry = new TextEntryState(new_mode_when_empty, '');
        this.switch_to_mode(new_mode_when_empty);
      }
      return stack;
    }
    else {
      if(backspace_type === 'backspace')
        this.text_entry.backspace();
      else if(backspace_type === 'delete')
        this.text_entry.do_delete();
      this.switch_to_mode(this.mode);
    }
    this.suppress_undo();
    return stack;
  }

  // textstyle determines what the entered text becomes:
  //   'math' - ExprItem with "parsed" italic math text
  //   'roman_text' - Expr with \mathrm{...}, where ... is always a TextExpr (not parsed as a math)
  //   'operatorname' - Similar to 'roman_text' but use \operatorname instead of \mathrm
  //   'latex' - ExprItem with arbitrary 0-argument latex command
  //   'latex_unary' - ExprItem with 1-argument (from stack) latex command
  //   'text' - TextItem
  //   'heading' - TextItem with is_heading flag set
  //   'conjunction' - "X  iff  Y" style InfixExpr conjunction
  //   'bold_conjunction' - same but the "iff" is bolded
  //   'tag' - set the tag_string of the stack top
  //   'tag_with_parentheses' - same as 'tag' but automatically surround with parentheses
  do_finish_text_entry(stack, textstyle) {
    if(!this.text_entry)
      return stack;  // shouldn't happen
    if(this.text_entry.is_empty() &&
       !(textstyle === 'tag' || textstyle === 'tag_with_parentheses'))
      return this._cancel_text_entry(stack);
    const text = this.text_entry.current_text;
    const trimmed_text = text.trim();  // will be recorded as item.source_string
    if(textstyle === 'text' || textstyle === 'heading') {
      // Text entry mode - create TextItems.
      let item = TextItem.parse_string(trimmed_text);
      if(item) {
        if(textstyle === 'heading') item.is_heading = true;
        this._cancel_text_entry(stack);
        return stack.push(item);
      }
      else {
        this.suppress_undo();
        this.switch_to_mode(this.mode);
        this.error_flash_stack();
        return stack;
      }
    }
    // Other cases here create ExprItems.
    let new_expr = null;
    if(textstyle === 'roman_text')
      new_expr = Expr.roman_text_to_expr(text);
    else if(textstyle === 'operatorname') {
      // Similar to 'roman_text' but filter out anything but alphanumeric characters,
      // spaces and dashes for use inside \operatorname{...}.
      // Currently in KaTeX, spaces need to be explicitly converted to \, inside \operatorname.
      const sanitized_text = text.replaceAll(/[^a-zA-Z0-9- ]/g, '').replaceAll(' ', "\\,");
      new_expr = new CommandExpr('operatorname', [new TextExpr(sanitized_text)]);
      // TODO: detect built-in operator names like 'sin' and convert them to \sin instead
      // of \operatorname{sin}.
      // TODO: maybe handle empty sanitized_text specially
    }
    else if(textstyle === 'latex') {
      // NOTE: do_append_text_entry should only allow alphabetic characters through,
      // so no real need to do sanitization here.
      new_expr = new CommandExpr(trimmed_text);
    }
    else if(textstyle === 'latex_unary') {
      // Create a LaTeX command with one argument from the stack.
      // This is invoked by Shift+Enter from latex entry mode, so there
      // was no opportunity to verify there was one expression on the stack
      // beforehand.  This is checked for explicitly here instead and the
      // updated stack with the argument expression removed and the new
      // command expression pushed is returned directly.
      if(stack.check_exprs(1)) {
        const [new_stack, argument_expr] = stack.pop_exprs(1);
        new_expr = new CommandExpr(trimmed_text, [argument_expr]);
        this._cancel_text_entry(new_stack);
        return new_stack.push_expr(new_expr);
      }
      else {
        this.suppress_undo();
        this.switch_to_mode(this.mode);
        this.error_flash_stack();
        return;
      }
    }
    else if(textstyle === 'conjunction' ||
            textstyle === 'bold_conjunction') {
      const [new_stack, left_expr, right_expr] = stack.pop_exprs(2);
      new_expr = Expr.combine_with_conjunction(
        left_expr, right_expr,
        trimmed_text, textstyle === 'bold_conjunction');
      this._cancel_text_entry(new_stack);
      return new_stack.push_expr(new_expr);
    }
    else if(textstyle === 'tag' ||
            textstyle === 'tag_with_parentheses') {
      const [new_stack, item] = stack.pop(1);
      const new_item = item.with_tag(
        trimmed_text.length === 0 ? null :
          textstyle === 'tag_with_parentheses' ?
          ['(', trimmed_text, ')'].join('') : trimmed_text);
      this._cancel_text_entry(new_stack);
      return new_stack.push(new_item);
    }
    else {
      try {
        new_expr = AlgebriteInterface.parse_string(text);
      }
      catch(e) {
        // Algebrite parse error.
        this.report_error(e.message);
      }
      if(!new_expr) {
        this.suppress_undo();
        this.switch_to_mode(this.mode);
        this.error_flash_stack();
        return;
      }
    }
    this._cancel_text_entry(stack);
    return stack.push(new ExprItem(
      new_expr,
      null /* no tag */,
      text /* source_string */));
  }

  // Start text entry mode using the item on the stack top.
  // Because the minieditor is so limited, only these cases are allowed:
  //   - Items with the original source_string available (i.e. if it was created
  //     with the minieditor to begin with, and not combined with anything yet).
  //     For TextItems, the minieditor will be started in text-entry mode.
  //   - ExprItems that are only a simple CommandExpr with a no-argument LaTeX command;
  //     in this case the minieditor will start directly in LaTeX-entry mode
  //     (or math-entry mode for special cases like \&).
  //   - ExprItems that represent a simple text string like '123' or 'xyz'.
  //   - ExprItems that represent \mathrm{x} where x is a simple string like '123' or 'xyz'
  //     (this is to allow expressions created via Shift+Enter in the minieditor to be editable).
  //   - ExprItems that represent \operatorname{x}.
  do_edit_item(stack) {
    const [new_stack, item] = stack.pop(1);
    let is_editable = true;  // set to false if it turns out to be uneditable
    if(item.is_text_item()) {
      if(item.source_string)
        this.do_start_text_entry(new_stack, 'text_entry', item.source_string);
      else is_editable = false;
    }
    else if(item.is_expr_item()) {
      const expr = item.expr;
      if(expr.is_command_expr_with(0) && expr.is_special_latex_command()) {
        // "Special" LaTeX command like \&.  These use math_entry mode with
        // the underlying escaped character (without the \).
        this.do_start_text_entry(new_stack, 'math_entry', expr.command_name);
      }
      else if(expr.is_command_expr_with(0)) {
        // LaTeX command with no arguments, e.g. \circledast
        // These use latex_entry mode with the command name.
        this.do_start_text_entry(new_stack, 'latex_entry', expr.command_name);
      }
      else {
        // Anything else.  Note that an empty item.source_string ('') can be used
        // to inhibit editing, even for things like TextExpr that would normally
        // be editable.  This is used currently to prevent editing of pasted
        // LaTeX code (via [Tab][V]) since the minieditor probably won't be able
        // to parse it.
        let s = item.source_string;
        if(s === '')
          is_editable = false;
        else {
          s ||= expr.as_editable_string();
          if(s)
            this.do_start_text_entry(new_stack, 'math_entry', s);
          else is_editable = false;
        }
      }
    }
    else is_editable = false;  // CodeItem, etc.
    if(is_editable) {
      this.text_entry.edited_item = item;
      return new_stack;
    }
    else
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
      this.suppress_undo();
      this.dissect_mode_initial_expr = expr;
      // Build a new ExprItem with a default initial selection.
      const new_item = new ExprItem(
        expr,
        null /* tag */,
        null /* source_string - discard */,
        new ExprPath(expr, [0]));
      return new_stack.push(new_item);
    }
    else
      return this.error_flash_stack();
  }

  do_cancel_dissect_mode(stack) {
    const [new_stack, ] = stack.pop_exprs(1);  // the expr is discarded
    this.suppress_undo();
    const original_expr = this.dissect_mode_initial_expr;
    this.dissect_mode_initial_expr = null;
    return new_stack.push(
      new ExprItem(original_expr, null, null, null));
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
        return new_stack.push(new ExprItem(expr, null, null, null));
        }     */

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
    if(!item.is_expr_item())
      stack.type_error();
    const expr_path = item.selected_expr_path;
    const expr_with_placeholder = expr_path.extract_selection();
    const extracted_expr = expr_path.selected_expr();
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
    if(!item.is_expr_item())
      stack.type_error();
    const expr_path = item.selected_expr_path;
    const extracted_expr = expr_path.selected_expr();
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
    if(!item.is_expr_item())
      stack.type_error();
    this.switch_to_mode(this.mode);
    const expr_path = item.selected_expr_path;
    const new_expr_path = fn(expr_path);
    if(new_expr_path) {
      this.suppress_undo();
      const new_expr_item = new ExprItem(
        new_expr_path.expr, null, null, new_expr_path);
      return new_stack.push(new_expr_item);
    }
    else
      return this.error_flash_stack();
  }

  do_toggle_is_heading(stack) {
    let [new_stack, item] = stack.pop(1);
    if(item.is_expr_item()) {
      // Implicitly turn ExprItems into TextItems.
      item = TextItem.from_expr(item.expr);
    }
    if(item.is_text_item()) {
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

  // TODO: optional argument to specify export vs. display mode in to_latex()
  do_extract_latex_source(stack) {
    const latex_source = stack.peek().to_latex(true /* export mode */);
    return stack.push(new CodeItem('latex', latex_source));
  }

  do_delimiters(stack, left, right) {
    const [new_stack, inner_expr] = stack.pop_exprs(1);
    // Special case: if the stack top is already a DelimiterExpr with "blank" delimiters
    // we can just rebuild a new DelimiterExpr with the specified delimiters instead,
    // without wrapping it in another DelimiterExpr.
    if(inner_expr.is_delimiter_expr() &&
       inner_expr.left_type === '.' && inner_expr.right_type === '.')
      return new_stack.push_expr(new DelimiterExpr(
        left, right, inner_expr.inner_expr));
    else {
      // The usual case.
      return new_stack.push_expr(
        new DelimiterExpr(left, right, inner_expr));
    }
  }

  // Wrap stack top in parentheses if it's not already in delimiters.
  // 'left_type' and 'right_type' default to '(' and ')' if not specified.
  do_parenthesize(stack, left_type, right_type) {
    let [new_stack, expr] = stack.pop_exprs(1);
    const new_expr = DelimiterExpr.parenthesize_if_not_already(
      expr, left_type, right_type);
    return new_stack.push_expr(new_expr);
  }

  // If expr_count_string is provided, exactly that many expressions from the stack
  // are autoparenthesized.  If any of them is not actually an ExprItem, nothing is done.
  do_autoparenthesize(stack, expr_count_string = '1') {
    const expr_count = parseInt(expr_count_string);
    const [new_stack, ...items] = stack.pop(expr_count);
    if(this.settings.autoparenthesize &&
       items.every(item => item.is_expr_item()))
      return new_stack.push_all_exprs(
        items.map(item => DelimiterExpr.autoparenthesize(item.expr)));
    else
      return stack;
  }

  // Parenthesize an expression if needed, assuming it's going to be the argument
  // to a function like sin(x).  See DelimiterExpr.parenthesize_for_argument().
  do_parenthesize_argument(stack) {
    const [new_stack, expr] = stack.pop_exprs(1);
    return new_stack.push_expr(
      DelimiterExpr.parenthesize_for_argument(expr));
  }

  // Combine command name and arguments from the stack into a CommandExpr.
  // \frac x y -> \frac{x}{y}
  do_apply_operator(stack, arg_count_string) {
    const arg_count = parseInt(arg_count_string);
    const [new_stack, command_expr, ...operand_exprs] = stack.pop_exprs(arg_count+1);
    if(command_expr.is_command_expr_with(0))
      return new_stack.push_expr(
        new CommandExpr(command_expr.command_name, operand_exprs));
    else
      return this.error_flash_stack();
  }

  do_toggle_popup(stack, mode_string) {
    // Special case: "toggling" the help while helptext is docked will undock it
    // but not put it back as a popup.
    if(mode_string === 'help' && this.settings.dock_helptext) {
      this.settings.dock_helptext = false;
      mode_string = null;
    }
    this.settings.popup_mode =
      (this.settings.popup_mode === mode_string) ? null : mode_string;
    this.app_component.state.file_manager.save_settings(this.settings);
    this.app_component.apply_layout_to_dom();
    this.suppress_undo();
  }

  // Set various configuration options.
  do_config(stack, config_option, value) {
    let settings = this.settings;
    let layout = settings.layout;
    let full_refresh_needed = false;  // set to true if everything needs to be re-rendered afterwards
    let scratch, scratch2;
    switch(config_option) {
    case 'zoom_factor':
    case 'helptext_zoom_factor':
      scratch = this._get_prefix_argument(1, -1);
      scratch2 = layout[config_option] || 0;  // new zoom exponent
      if((this.prefix_argument !== null && scratch <= 0) /* [*] or [0] prefix arg */ ||
         value === 'reset') scratch2 = 0;
      else if(value === 'decrease') scratch2 -= scratch;
      else scratch2 += scratch;
      // Limit zoom percentage to around 2% ... 10000%
      layout[config_option] = scratch2 = Math.max(Math.min(scratch2, 80), -80);
      this.notify([
        config_option === 'helptext_zoom_factor' ? 'User guide zoom: ' : 'Zoom level: ',
        scratch2 > 0 ? '+' : '', scratch2.toString()].join(''));
      break;
    case 'math_align':
      scratch = value === 'document' ?
        layout.document_math_alignment : layout.stack_math_alignment;
      if(scratch === 'left') scratch = 'center';
      else if(scratch === 'center') scratch = 'right';
      else scratch = 'left';
      if(value === 'document')
        layout.document_math_alignment = scratch;
      else layout.stack_math_alignment = scratch;
      full_refresh_needed = true;
      this.notify(
        (value === 'document' ? 'Document' : 'Stack') +
          ' alignment: ' + scratch);
      break;
    case 'toggle_inline_math':
      layout.inline_math = !layout.inline_math;
      full_refresh_needed = true;
      this.notify("Inline math display " + (layout.inline_math ? "on" : "off"));
      break;
    case 'toggle_mode_indicator':
      settings.show_mode_indicator = !settings.show_mode_indicator;
      this.notify("Mode indicator " +
                  (settings.show_mode_indicator ? "enabled" : "disabled"));
      break;
    case 'toggle_hide_mouse_cursor':
      settings.hide_mouse_cursor = !settings.hide_mouse_cursor;
      this.notify("Mouse cursor now " +
                  (settings.hide_mouse_cursor ? "hidden" : "visible"));
      break;
    case 'stack_side':
      layout.stack_side = value;
      break;
    case 'stack_split':
      // prefix argument:
      //   none:    50%
      //   0..9:    0% to 90%
      //   *:       100%
      //   11..99:  11% to 99% (undocumented)
      scratch = this._get_prefix_argument(5, 10);
      if(scratch <= 10) scratch *= 10;
      if(scratch > 100) scratch = 100;
      layout.stack_split = scratch;
      break;
    case 'inverse_video':
      settings.filter = settings.filter === 'inverse_video' ? null : 'inverse_video';
      break;
    case 'sepia':
      settings.filter = settings.filter === 'sepia' ? null : 'sepia';
      this.notify("Sepia filter " + (settings.filter === 'sepia' ? "on" : "off"));
      break;
    case 'eink_mode':
      settings.filter = settings.filter === 'eink' ? null : 'eink';
      this.notify("E-ink mode " + (settings.filter === 'eink' ? "on" : "off"));
      break;
    case 'dock_helptext':
      settings.popup_mode = null;  // close help popup
      settings.dock_helptext = (value === 'on');
      break;
    case 'autoparenthesize':
      settings.autoparenthesize = (value === 'on');
      this.notify("Autoparenthesize " + (settings.autoparenthesize ? "on" : "off"));
      break;
    case 'reset_layout':
      settings.reset();
      full_refresh_needed = true;
      this.notify("Configuration reset to default");
      break;
    case 'reload_page':
      window.location.reload();
      break;
    case 'toggle_debug_mode':
      settings.debug_mode = !settings.debug_mode;
      this.notify("Debug mode " + (settings.debug_mode ? "on" : "off"));
      break;
    default:
      break;
    }
    this.suppress_undo();
    this.app_component.state.file_manager.save_settings(this.settings);
    this.app_component.apply_layout_to_dom();
    if(full_refresh_needed) {
      // All displayed ItemComponents need to be re-rendered.
      this.update_document(this.app_state.document.clone_all_items());
      return stack.clone_all_items();
    }
  }

  do_fullscreen(stack, on_or_off) {
    if(on_or_off === 'off') {
      if(document.fullscreenElement)
        document.exitFullscreen();
    }
    else
      document.getElementsByTagName('html')[0].requestFullscreen();
    this.suppress_undo();
    return stack;
  }

  // item1, item2, ... => [item1, item2, ...]
  // column_count is optional; if omitted, the prefix argument is used.
  do_matrix_row(stack, matrix_type, column_count) {
    const expr_count = column_count ?
          parseInt(column_count) :
          this._get_prefix_argument(0, stack.depth());
    if(expr_count <= 0)
      return this.error_flash_stack();
    const [new_stack, ...exprs] = stack.pop_exprs(expr_count);
    const matrix_expr = new ArrayExpr(
      (matrix_type || 'bmatrix'), 1, expr_count, [exprs]);
    return new_stack.push_expr(matrix_expr);
  }

  // Start building a NxM matrix from the stack.
  // N must be provided as a prefix argument, e.g.: [|][3][x]
  // This switches to build_matrix mode which then expects another
  // prefix argument for the column count (M).  A final matrix-type key like
  // [ then creates the matrix with N*M items from the stack.
  do_matrix(stack) {
    const row_count = this._require_prefix_argument(false);
    this.matrix_row_count = row_count;  // save for do_finish_build_matrix()
    this.switch_to_mode('build_matrix');
    return stack;
  }

  do_finish_build_matrix(stack, matrix_type) {
    const column_count = this._require_prefix_argument(false);
    const row_count = this.matrix_row_count;
    const [new_stack, ...exprs] = stack.pop_exprs(column_count*row_count);
    // Arrange 'exprs' from the stack into a row*column array of arrays.
    const element_exprs = [];
    for(let row = 0; row < row_count; row++)
      element_exprs.push(exprs.slice(row*column_count, (row+1)*column_count));
    const matrix_expr = new ArrayExpr(
      matrix_type, row_count, column_count, element_exprs);
    return new_stack.push_expr(matrix_expr);
  }

  // Stack N ArrayExprs together (default=2).
  // direction:
  //   'vertical': Stack vertically; arrays must have the same number of columns.
  //   'horizontal': Stack horizontally; arrays must have the same number of rows.
  // The result will have the same bracket type as the first array.
  do_stack_arrays(stack, direction) {
    const array_count = this._get_prefix_argument(2, stack.depth());
    if(array_count < 1) return stack;
    const [new_stack, ...arrays] = stack.pop_arrays(array_count);
    let new_array = arrays[0];
    for(let i = 1; i < array_count; i++) {
      if(direction === 'vertical')
        new_array = ArrayExpr.vstack_arrays(new_array, arrays[i]);
      else
        new_array = ArrayExpr.hstack_arrays(new_array, arrays[i]);
      if(!new_array)
        return stack.type_error();
    }
    return new_stack.push_expr(new_array);
  }

  // Split an ArrayExpr into its component rows and put them on the stack.
  do_split_array(stack) {
    const [new_stack, array_expr] = stack.pop_arrays(1);
    return new_stack.push_all_exprs(array_expr.split_rows());
  }

  do_insert_matrix_ellipses(stack) {
    const [new_stack, matrix_expr] = stack.pop_matrices(1);
    return new_stack.push_expr(matrix_expr.with_ellipses());
  }

  do_transpose_matrix(stack) {
    const [new_stack, expr] = stack.pop_exprs(1);
    if(expr.is_matrix_expr()) {
      // Transpose a matrix "literal" directly.
      return new_stack.push_expr(expr.transposed());
    }
    else {
      // Put a transpose symbol on a generic expression.
      const new_expr = expr.with_superscript(
        FontExpr.roman_text('T'),
        this.settings.autoparenthesize);
      return new_stack.push_expr(new_expr);
    }
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
    else return new_stack.push_expr(
      matrix_expr.with_separator(
        is_column,
        index === null ? null : index-1,
        separator_type, true));
  }

  do_align(stack, align_type) {
    // NOTE: If align_type = 'cases' or 'rcases', align on ':' infix
    // if there is one, and then remove the infix.
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
    return new_stack.push_expr(
      new ArrayExpr(
        align_type,
        element_exprs.length,
        element_exprs[0].length,
        element_exprs));
  }

  // Take [x_1,...,x_n] from the stack (where n is the prefix argument)
  // and build an InfixExpr with the given text between each term as an infix operator.
  // 'final_operand_text' is used as the next to last operand if provided.
  do_infix_list(stack, infix_text, final_operand_text) {
    this._require_prefix_argument(true);
    const expr_count = this._get_prefix_argument(1, stack.depth());
    const [new_stack, ...exprs] = stack.pop_exprs(expr_count);
    const infix_operator_expr = Expr.text_or_command(infix_text);
    let operand_exprs = exprs;
    if(final_operand_text) {
      // Splice in the final_operand if specified.
      const final_operand = Expr.text_or_command(final_operand_text);
      operand_exprs = operand_exprs
        .slice(0, expr_count-1)
        .concat([final_operand], operand_exprs.slice(expr_count-1));
    }
    return new_stack.push_expr(
      InfixExpr.combine_infix_all(operand_exprs, infix_operator_expr));
  }

  // Take [x_1, ..., x_n] from the stack and build a \substack{...} command.
  // This is treated internally as a special kind of ArrayExpr.
  do_substack(stack) {
    const expr_count = this._require_prefix_argument();
    const [new_stack, ...exprs] = stack.pop_exprs(expr_count);
    const row_exprs = exprs.map(expr => [expr]);  // Nx1 array
    return new_stack.push_expr(
      new ArrayExpr('substack', expr_count, 1, row_exprs));
  }

  // side: 'left' or 'right'
  // upper_or_lower: 'upper' or 'lower' or 'both'
  do_add_tensor_index(stack, side, upper_or_lower) {
    const arg_count = upper_or_lower === 'both' ? 2 : 1;
    const [new_stack, base_expr, ...new_index_exprs] =
          stack.pop_exprs(1+arg_count);
    const tensor_expr = TensorExpr.from_expr(base_expr);
    let upper_index_expr = null, lower_index_expr = null;
    switch(upper_or_lower) {
    case 'upper': upper_index_expr = new_index_exprs[0]; break;
    case 'lower': lower_index_expr = new_index_exprs[0]; break;
    case 'both': [lower_index_expr, upper_index_expr] = new_index_exprs; break;
    default: return this.error_flash_stack();  // shouldn't happen
    }
    const new_tensor_expr = tensor_expr.add_indices(
      side, upper_index_expr, lower_index_expr,
      side === 'left' /* put new indexes to left of any existing ones */);
    return new_stack.push_expr(new_tensor_expr);
  }

  // "Affix" an expression to a tensor on the given side ('left' or 'right').
  // Works like add_tensor_index, but attaches the expression to both
  // upper and lower indices as long as the corresponding slots are populated.
  // This is used to add commas and ellipses into the indices.
  do_affix_tensor_index(stack, side) {
    const [new_stack, base_expr, new_index_expr] = stack.pop_exprs(2);
    const tensor_expr = TensorExpr.from_expr(base_expr);
    const new_tensor_expr = tensor_expr.affix_index(
      side, new_index_expr, side === 'left');
    return new_stack.push_expr(new_tensor_expr);
  }

  // Swap upper (contravariant) and lower (covariant) indexes of a TensorExpr.
  // This will also swap superscripts and subscripts in a SubscriptSuperscriptExpr.
  do_swap_tensor_index_type(stack) {
    const [new_stack, expr] = stack.pop_exprs(1);
    let new_expr = expr;
    if(expr.is_tensor_expr())
      new_expr = expr.swap_lower_and_upper();
    else if(expr.is_subscriptsuperscript_expr())
      new_expr = new SubscriptSuperscriptExpr(
        expr.base_expr, expr.superscript_expr, expr.subscript_expr);
    return new_stack.push_expr(new_expr);
  }

  // Slide tensor indices towards the base expression.
  do_condense_tensor(stack) {
    const [new_stack, expr] = stack.pop_exprs(1);
    if(!expr.is_tensor_expr())
      return stack.type_error();
    return new_stack.push_expr(expr.condense());
  }

  // Copy stack top to an internal clipboard slot.
  // TODO: A prefix argument may be given to access other slots but prefix
  // arguments with stack commands highlight items on the stack which is bad UI.
  do_copy_to_clipboard(stack) {
    const [new_stack, item] = stack.pop(1);
    const slot = this._get_prefix_argument(1, '*');
    this.app_component.state.clipboard_items[slot] = item;
    if(slot === 1)
      this.notify("Copied to clipboard");
    else
      this.notify("Copied to clipboard slot " + slot);
    this.suppress_undo();
    return new_stack.push(item);
  }

  do_paste_from_clipboard(stack) {
    const slot = this._get_prefix_argument(1, '*');
    const item = this.app_component.state.clipboard_items[slot];
    if(item)
      return stack.push(item.clone());
    else
      return this.error_flash_stack();
  }

  // Prompt for a LaTeX source string and put it on the stack as a TextExpr.
  do_paste_from_prompt(stack) {
    let code = window.prompt('Enter LaTeX code') || '';
    // Strip (ignore) any surrounding whitespace and $$ ... $$
    code = code.trim();
    let limit = 6;
    while(limit-- > 0) {
      if(code.startsWith("$")) code = code.slice(1);
      if(code.endsWith("$")) code = code.slice(0, code.length-1);
    }
    code = code.trim();  // to handle for example: "  $$  xyz  $$  "
    if(code.length === 0)
      return stack;
    // Add spaces around the code to protect against concatenation resulting
    // in invalid LaTeX code.  For example, pasting "\bullet" then
    // concatenating "x" would result in "\bulletx".  Normally, "\bullet" would
    // be a CommandExpr and this would correctly generate "\bullet x", but since
    // the pasted code is not parsed, we don't know to do that.
    // Adding spaces isn't perfect, but prevents most unintentional cases like this.
    code = [' ', code, ' '].join('');
    // Create the ExprItem with an explicit empty source_string;
    // this will inhibit editing with the minieditor.
    const item = new ExprItem(new TextExpr(code), null, '');
    return stack.push(item);
  }

  do_swap_floating_item(stack) {
    if(stack.floating_item)
      return stack.with_floating_item(null).push(stack.floating_item);
    else {
      const [new_stack, item] = stack.pop(1);
      return new_stack.with_floating_item(item);
    }
  }

  // See App.recenter_document()
  do_recenter_document(stack, screen_percentage_string) {
    const screen_percentage = parseInt(screen_percentage_string);
    this.app_component.recenter_document(screen_percentage);
    this.suppress_undo();
    return stack;
  }

  // direction_string: 'vertical' or 'horizontal'
  // percentage_string:
  //   - 'top' or 'bottom' to go to the beginning or end (vertical only)
  //   - or: percentage of the current popup height (or width) to scroll by
  do_scroll(stack, panel_name, direction_string, percentage_string) {
    // When the helptext is docked, redirect document scrolling commands
    // to the helptext container instead.
    if(this.settings.dock_helptext && panel_name === 'document_panel')
      panel_name = 'helptext_panel';
    // TODO: get elements from app_component.*_ref.current
    const panel_elt = document.getElementById(panel_name);
    if(!panel_elt) return;
    if(direction_string === 'vertical' &&
       ['top', 'bottom'].includes(percentage_string)) {
      if(percentage_string === 'top') panel_elt.scrollTop = 0;
      else panel_elt.scrollTop = panel_elt.scrollHeight;
      return stack;
    }
    else {
      const percentage = parseInt(percentage_string || '50') / 100.0;
      if(direction_string === 'vertical')
        panel_elt.scrollTop += Math.round(panel_elt.clientHeight * percentage);
      else if(direction_string === 'horizontal')
        panel_elt.scrollLeft += Math.round(panel_elt.clientWidth * percentage);
    }
  }

  // Scroll to the given DOM element (used to jump around in help).
  do_scroll_to(stack, element_id) {
    const elt = document.getElementById(element_id);
    if(elt) elt.scrollIntoView();
    return stack;
  }

  do_export_document_as_text(stack) {
    const items = this.app_state.document.items;
    this._do_export_items(items);
    return stack;
  }

  do_export_stack_items_as_text(stack) {
    const arg = this._get_prefix_argument(1, stack.depth());
    const [, ...items] = stack.pop(arg);
    this._do_export_items(items);
    return stack;
  }

  _do_export_items(items) {
    const exported_text = items
          .map(item => item.to_latex(true))
          .join("\n\n");
    navigator.clipboard.writeText(exported_text);
    this.notify([
      "Copied ", items.length.toString(), " item",
      (items.length === 1 ? "" : "s"),
      " to clipboard"].join(''));
    this.suppress_undo();
  }
}


export { InputContext };

