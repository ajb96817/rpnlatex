

import {
  encode as msgpack_encode,
  decode as msgpack_decode
} from '@msgpack/msgpack';
import KeybindingTable from './Keymap';
import {
  Expr, TextExpr, CommandExpr, SequenceExpr, DelimiterExpr,
  SubscriptSuperscriptExpr, InfixExpr, PrefixExpr, PostfixExpr,
  FontExpr, PlaceholderExpr, FunctionCallExpr, ArrayExpr
} from './Exprs.js';
import {
  AlgebriteInterface, double_to_expr
} from './CAS';


class Keymap {
  constructor() {
    this.bindings = KeybindingTable;
  }
  
  lookup_binding(mode, key) {
    const mode_map = this.bindings[mode];
    if(!mode_map) return null;
    if(mode_map[key]) return mode_map[key];
    if(mode_map['[alpha]'] && /^[a-zA-Z]$/.test(key)) return mode_map['[alpha]'];
    if(mode_map['[digit]'] && /^[0-9]$/.test(key)) return mode_map['[digit]'];
    if(mode_map['[alnum]'] && /^[a-zA-Z0-9]$/.test(key)) return mode_map['[alnum]'];
    if(mode_map['delegate']) return this.lookup_binding(mode_map['delegate'], key);
    if(mode_map['default']) return mode_map['default'];
    if(mode === 'base')
      return null;
    else
      return 'cancel';
  }
}


class Settings {
  static from_json(json) {
    let s = new Settings();
    for(const key of this.saved_keys())
      s[key] = json[key];
    return s;
  }

  static saved_keys() {
    return [
      'debug_mode',
      'filter',
      'last_opened_filename',
      'popup_mode',
      'dock_helptext',
      'show_mode_indicator',
      'hide_mouse_cursor',
      'autoparenthesize',
      'layout'  // nested layout object
    ];
  }
  
  constructor() {
    this.current_keymap = new Keymap();
    this.debug_mode = false;
    this.filter = null;  // null, 'inverse_video', 'sepia', 'eink'
    this.last_opened_filename = null;
    this.popup_mode = null;  // null, 'help', 'files'
    this.dock_helptext = false;  // true if user guide docked to document area
    this.show_mode_indicator = true;
    this.hide_mouse_cursor = false;
    this.autoparenthesize = true;
    this.layout = this.default_layout();
  }

  default_layout() {
    return {
      zoom_factor: 0,
      stack_math_alignment: 'left',
      document_math_alignment: 'left',
      inline_math: false,
      stack_side: 'left',
      stack_split: 50
    };
  }

  // Set stack/document panel bounds based on current user settings.
  // Hide or unhide file manager / helptext popup panels depending on
  // what is active.  If the helptext is "docked", it is positioned to
  // overlay the documents panel (with a higher z-index).
  apply_layout_to_dom(stack_panel_elt, document_panel_elt,
                      file_manager_panel_elt, helptext_panel_elt) {
    const layout = this.layout;

    file_manager_panel_elt.style.display =
      this.popup_mode === 'files' ? 'block' : 'none';
    helptext_panel_elt.style.display =
      this.popup_mode === 'help' ? 'block' : 'none';

    // Set overall font scale factor.
    const root_elt = document.getElementById('root');
    const percentage = 100*Math.pow(1.05, layout.zoom_factor || 0);
    root_elt.style.fontSize = percentage.toFixed(2) + '%';

    // Set some specific scale factors for other UI elements
    // by manipulating the corresponding CSS variables.
    const root_vars = document.querySelector(':root');
    const itembar_pixels = Math.min(10, Math.max(2, Math.round(4 * percentage/100)));
    root_vars.style.setProperty('--itemtype-bar-width', itembar_pixels + 'px');
    const headingbar_pixels = Math.max(1, Math.round(3 * percentage/100));
    root_vars.style.setProperty('--heading-bar-height', headingbar_pixels + 'px');

    // Set up stack/document panel layout.
    let [stack_bounds, document_bounds] = this._split_rectangle(
      {x: 0, y: 0, w: 100, h: 100},
      layout.stack_side, layout.stack_split);
    this._apply_bounds(stack_panel_elt, stack_bounds);
    this._apply_bounds(document_panel_elt, document_bounds);

    // Set up User Guide layout.
    if(this.popup_mode === 'help') {
      helptext_panel_elt.className = 'popup panel';
      helptext_panel_elt.style.display = 'block';
      this._remove_bounds(helptext_panel_elt);
    }
    else if(this.dock_helptext) {
      helptext_panel_elt.className = 'docked panel';
      helptext_panel_elt.style.display = 'block';
      this._apply_bounds(helptext_panel_elt, document_bounds);
    }
    else {
      helptext_panel_elt.className = 'panel';
      helptext_panel_elt.style.display = 'none';
    }

    // Show or hide File Manager depending on mode.
    file_manager_panel_elt.style.display =
      this.popup_mode === 'files' ? 'block' : 'none';
  }

  // Split a parent bounding rectangle into "primary" and "secondary"
  // subrectangles according to the given 'side' and split %.
  _split_rectangle(bounds, side, split_percent) {
    const w1 = Math.round(split_percent*bounds.w/100);
    const w2 = bounds.w - w1;
    const h1 = Math.round(split_percent*bounds.h/100);
    const h2 = bounds.h - h1;
    switch(side) {
    case 'left':
      return [{x: bounds.x,    y: bounds.y, w: w1, h: bounds.h},
              {x: bounds.x+w1, y: bounds.y, w: w2, h: bounds.h}];
    case 'right':
      return [{x: bounds.x+w2, y: bounds.y, w: w1, h: bounds.h},
              {x: bounds.x,    y: bounds.y, w: w2, h: bounds.h}];
    case 'top':
      return [{x: bounds.x, y: bounds.y,    w: bounds.w, h: h1},
              {x: bounds.x, y: bounds.y+h1, w: bounds.w, h: h2}];
    case 'bottom':
      return [{x: bounds.x, y: bounds.y+h2, w: bounds.w, h: h1},
              {x: bounds.x, y: bounds.y,    w: bounds.w, h: h2}];
    default:
      return [bounds, bounds];
    }
  }

  _apply_bounds(elt, bounds) {
    elt.style.left = bounds.x + '%';
    elt.style.top = bounds.y + '%';
    elt.style.width = bounds.w + '%';
    elt.style.height = bounds.h + '%';
  }

  // Clear explicit bounds style properties.
  // (For the helptext popup panel, this is used when 'undocking' it
  // from the document area.)
  _remove_bounds(elt) {
    for(const p of ['left', 'top', 'width', 'height'])
      elt.style.removeProperty(p);
  }

  to_json() {
    let json = {};
    for(const key of Settings.saved_keys())
      json[key] = this[key];
    return json;
  }
}


// Holds context for the text entry mode line editor (InputContext.text_entry).
// Fields:
// 'mode': Type of text entry currently being performed.
//         (these strings also correspond to the InputContext mode).
//     'text_entry': ["] - text entry will become a TextItem (a section heading if Shift+Enter is used)
//     'math_entry': [\] - text entry will become a ExprItem with either normal italic math text
//         (if Enter is used) or \mathrm roman math text (if Shift+Enter)
//     'latex_entry': [\][\] - text entry will become a ExprItem with an arbitrary LaTeX command
//     'conjunction_entry': [,]['] - text entry will become a "conjuction" like "X  for  Y", same
//         as commands like [,][r].
//     'tag_entry': [/][;] - text entry will become the tag_string of the ExprItem
//         (or the tag_string is removed if text entry is empty).
// 'text': The string to be edited (editing is done non-destructively).
// 'edited_item': If this is set, this is the Item that is currently being edited.
//      While it's being edited, it doesn't exist on the stack and is temporarily held here.
//      If the editor is cancelled, this item will be placed back on the stack.
// 'cursor_position':
//     0: for beginning of string,
//     current_text.length: after end of string (the usual case)
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

  // ('delete' is a Javascript keyword)
  do_delete() {
    if(this.cursor_position < this.current_text.length)
      this.current_text = [
        this.current_text.slice(0, this.cursor_position),
        this.current_text.slice(this.cursor_position+1)].join('');
  }

  move(direction) {
    if(direction === 'left' && this.cursor_position > 0)
      this.cursor_position--;
    else if(direction === 'right' && this.cursor_position < this.current_text.length)
      this.cursor_position++;
    else if(direction === 'begin')
      this.cursor_position = 0;
    else if(direction === 'end')
      this.cursor_position = this.current_text.length;
  }
}


// Helper for generating LaTeX strings from Expr objects.
class LatexEmitter {
  static latex_escape(text) {
    const replacements = {
      ' ': "\\,",
      '_': "\\_",
      '^': "\\wedge{}",
      '%': "\\%",
      "'": "\\rq{}",
      "`": "\\lq{}",
      '$': "\\$",
      '&': "\\&",
      '#': "\\#",
      '}': "\\}",
      '{': "\\{",
      '~': "\\sim{}",
      ':': "\\colon{}",
      "\\": "\\backslash{}"
    };
    return text.replaceAll(/[ _^%'`$&#}{~:\\]/g, match => replacements[match]);
  }

  // Inverse of latex_escape.  This is used by do_edit_item to allow simple TextExprs
  // to be editable again in the minieditor.
  static latex_unescape(text) {
    // TODO: figure out a better way of handling this so it doesn't repeat
    // what's in latex_escape
    const replacements = {
      "\\,": ' ',
      "\\_": '_',
      "\\wedge{}": '^',
      "\\%": '%',
      "\\rq{}": "'",
      "\\lq{}": "`",
      "\\$": '$',
      "\\&": '&',
      "\\#": '#',
      "\\}": '}',
      "\\{": '{',
      "\\sim{}": '~',
      "\\colon{}": ':',
      "\\backslash{}": "\\"
    };
    return text.replaceAll(
      /\\,|\\_|\\wedge\{\}|\\%|\\rq\{\}|\\lq\{\}|\\\$|\\&|\\#|\\\}|\\\{|\\sim\{\}|\\colon\{\}|\\backslash\{\}/g,
      match => replacements[match]);
  }

  // selected_expr_path is optional, but if provided it is an ExprPath
  // object that indicates which Expr is to be rendered with a "highlight"
  // indicating that it is currently selected.
  constructor(base_expr, selected_expr_path) {
    this.base_expr = base_expr;
    this.tokens = [];
    this.last_token_type = null;
    // Set export_mode to true to get "exportable" LaTeX code instead of the
    // default "display mode" code.  This removes some hacks to get KaTeX to
    // render things properly.
    this.export_mode = false;
    this.selected_expr_path = selected_expr_path;
    // Initialize a "blank" ExprPath that tracks the rendering.
    // When this current_path matches up with selected_expr_path,
    // that's when it's pointing at the selected expr.
    if(this.selected_expr_path)
      this.current_path = new ExprPath(base_expr, []);
  }

  emit_token(text, token_type) {
    if(text.length > 0)
      this.tokens.push(text);
    this.last_token_type = token_type;
  }

  // 'index' is the index of this (sub)expression within its parent.
  // This is used to correlate with the given this.selected_expr_path
  // so that we know when we've hit the right subexpression to highlight.
  // (Expr objects can be aliased so we can't just rely on object identity.)
  // 'inside_delimiters' will be true if expr is the inner_expr of a DelimiterExpr
  // (cf. InfixExpr.emit_latex()).
  expr(expr, index, inside_delimiters) {
    if(index !== null && this.selected_expr_path)
      this.current_path = this.current_path.descend(index);
    // Check if we're now rendering the 'selected' expression.
    if(this.selected_expr_path &&
       this.selected_expr_path.equals(this.current_path)) {
      // Wrap the selected expression in something to "highlight" it
      // and render that instead.
      const highlight_expr = new CommandExpr('htmlClass', [
        new TextExpr('dissect_highlight_brace'),
        new CommandExpr('overbrace', [
          new CommandExpr('htmlClass', [
            new TextExpr('dissect_highlight'),
            expr])])]);         
      highlight_expr.emit_latex(this, inside_delimiters);
    }
    else
      expr.emit_latex(this, inside_delimiters);
    if(index !== null && this.selected_expr_path)
      this.current_path = this.current_path.ascend();
  }

  grouped_expr(expr, force_braces, index) {
    this.grouped(() => this.expr(expr, index), force_braces);
  }

  grouped(fn, force_braces) {
    let [old_tokens, old_last_token_type] = [this.tokens, this.last_token_type];
    [this.tokens, this.last_token_type] = [[], null];

    fn();

    const [tokens, last_token_type] = [this.tokens, this.last_token_type];
    this.tokens = old_tokens;
    this.last_token_type = old_last_token_type;

    // The only real 'special' case is a group with exactly 1 token.
    // In that case we may be able to omit the surrounding braces if
    // it's a 1-character string or a single \latexcommand.  In all other
    // cases the braces need to be included.
    if(force_braces === 'force' || tokens.length === 0 || tokens.length > 1) {
      this.text('{');
      this.text(tokens.join(''));
      this.text('}');
    }
    else {  // tokens.length === 1 && !force_braces
      if(last_token_type === 'text') {
        if(tokens[0].length === 1)
          this.text(tokens[0]);
        else {
          this.text('{');
          this.text(tokens[0]);
          this.text('}');
        }
      }
      else if(force_braces === 'force_commands') {
        this.text('{');
        this.emit_token(tokens[0], 'command');
        this.text('}');
      }
      else
        this.emit_token(tokens[0], 'command');
    }
  }

  // Emit 'raw' LaTeX code.
  text(text, force_braces) {
    if(force_braces) {
      this.text('{');
      this.text(text);
      this.text('}');
      return;
    }
    if(this.last_token_type === 'command') {
      // Determine if a space is needed after the last command; this depends
      // on whether two non-special characters are adjacent.
      const last_token = this.tokens[this.tokens.length-1];
      if(this._is_latex_identifier_char(last_token.charAt(last_token.length-1)) &&
         (this._is_latex_identifier_char(text.charAt(0)) /*|| text.charAt(0) === '{'*/))
        this.emit_token(' ', 'text');
    }
    this.emit_token(text, 'text');
  }

  _is_latex_identifier_char(ch) {
    return /^[a-zA-Z]$/.test(ch);
  }

  // \latexcommand (something that isn't a single special-character command like \,)
  command(command_name, command_options) {
    if(command_options)
      command_name = [command_name, '[', command_options, ']'].join('');
    this.emit_token("\\" + command_name, 'command');
  }

  // Treated like text or a command depending on whether it starts with a backslash.
  text_or_command(text) {
    if(text.startsWith("\\"))
      this.command(text.slice(1));
    else
      this.text(text);
  }

  // environment_argument is an optional string to be placed directly after the \begin{...}.
  // This is used for array environments with a specified column layout, for example
  // \begin{matrix}{c:c:c}
  begin_environment(envname, environment_argument) {
    this.text("\\begin{" + envname + "}");
    if(environment_argument)
      this.text(environment_argument);
    this.text("\n");
  }

  end_environment(envname) { this.text("\n\\end{" + envname + "}\n"); }

  align_separator() { this.text(' & '); }

  // Table row separators for e.g. \begin{matrix}
  row_separator() {
    // Default spacing:
    this.text("\\\\\n");

    // Alternate spacing: give a little more space between rows, for fractions.
    // See KaTeX "common issues" page.
    // this.text("\\\\[0.1em]\n");
  }

  finished_string() { return this.tokens.join(''); }
}


// Overall app state, holding the stack and document.
class AppState {
  constructor(stack, document) {
    this.stack = stack || this._default_stack();
    this.document = document || new Document();
    this.is_dirty = false;
  }

  _default_stack() {
    const item = TextItem.parse_string(
      "Welcome to the editor.  Type **[?]** to view the User Guide.");
    return new Stack().push(item);
  }

  same_as(app_state) {
    // NOTE: AppState stuff is never modified in-place, so all that needs to be
    // done here is check object identities.
    return this.stack === app_state.stack && this.document === app_state.document;
  }

  // Total number of contained items (stack+document).
  item_count() {
    return this.stack.depth() +
      this.document.items.length +
      (this.stack.floating_item ? 1 : 0);
  }
}


class UndoStack {
  constructor() {
    // Stack of saved AppState instances (most recent one at the end).
    this.state_stack = [];
    // Maximum size of this.state_stack.
    this.max_stack_depth = 100;
    // Number of consecutive undo operations that have been performed so far.
    // If this is greater that zero, 'redo' operations can revert the undos.
    this.undo_count = 0;
  }

  clear(initial_app_state) {
    this.state_stack = [initial_app_state];
    this.undo_count = 0;
  }

  push_state(state) {
    // Only save state if it differs from the state we'd be undoing to.
    if(this.state_stack.length > this.undo_count &&
       this.state_stack[this.state_stack.length - this.undo_count - 1].same_as(state))
      return null;
    if(this.undo_count > 0) {
      // Truncate already-undone saved states.  This means that 'redo' will no longer work
      // until some more undos are performed.
      this.state_stack = this.state_stack.slice(
        0, this.state_stack.length - this.undo_count);
      this.undo_count = 0;
    }
    this.state_stack.push(state);
    // Prevent the undo list from growing indefinitely.
    if(this.state_stack.length > this.max_stack_depth)
      this.state_stack = this.state_stack.slice(
        this.state_stack.length - this.max_stack_depth);
    return state;
  }

  undo_state() {
    if(this.state_stack.length-1 > this.undo_count) {
      this.undo_count++;
      return this.state_stack[this.state_stack.length - this.undo_count - 1];
    }
    else
      return null;
  }

  redo_state() {
    if(this.undo_count > 0) {
      this.undo_count--;
      return this.state_stack[this.state_stack.length - this.undo_count - 1];
    }
    else
      return null;
  }
}


// FileState maintains the 'state' for the file manager popup (the current
// list of files and currently selected file).
//
// It is also the interface to the browser's localStorage and handles
// loading/saving of files (serialized AppStates).
//
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API
//
// Files are saved in localStorage with keys of the form:
//   "filename:filesize_in_bytes:item_count:timestamp".
// localStorage keys starting with "$" are reserved for things like Settings.
// Generally, there should be only one localStorage key for a given filename,
// but in case there wind up being multiples, the one with the most recent
// timestamp is used.
//
// localStorage doesn't support 8-bit byte arrays, so the msgpack-serialized
// AppStates are encoded with Base64 before being saved.
class FileManager {
  constructor() {
    // This could be changed to sessionStorage if wanted (not really useful though).
    this.storage = localStorage;

    // User-visible sorted list of available stored file infos.
    // Uniquified if there happens to be multiples of a filename
    // (with different timestamps).
    this.available_files = null;

    // Total (approximate) storage used currently in bytes.
    this.storage_used = null;

    // Storage quota in bytes.  Currently just an estimate; localStorage
    // limit is generally 5-10MB.  There's no way to get the actual limit
    // besides trying to store more and more until it fails.
    // If this is null it means there is an unlimited quota.
    this.storage_quota = 5000*1024;

    // Filename of the AppState (stack/document) currently being edited.
    // This is always "something" (never null), even if the file isn't saved to storage.
    this.current_filename = 'untitled_1';

    // Currently selected file in the file manager (not necessarily the same
    // as current_filename until the selected file is loaded).
    this.selected_filename = null;
  }

  // Execute fn() while handling storage-related (and other) exceptions.
  // Returns one of:
  //   ['success', fn_return_value]
  //   ['quota_exceeded', null]  (localStorage space full)
  //   ['error', error_message]  (any other exception)
  with_local_storage(fn) {
    try { return ['success', fn()]; }
    catch(e) {
      if(e instanceof DOMException && e.name === 'QuotaExceededError')
        return ['quota_exceeded', null];
      else
        return ['error', e.toString()];
    }
  }

  // Check if we can use the localStorage at all.
  check_storage_availability() {
    const [result_code, ] = this.with_local_storage(() => {
      const key = '$storage_test';
      this.storage.setItem(key, 'test');
      this.storage.removeItem(key);
    });
    return result_code === 'success';
  }

  // Try to load the user Settings from localStorage.
  // If unable to load, return a Settings initialized to the defaults.
  // Settings are stored as a JSON string.
  load_settings() {
    const [result_code, settings] = this.with_local_storage(() => {
      const json_string = this.storage.getItem('$settings');
      if(json_string)
        return Settings.from_json(JSON.parse(json_string));
      else return null;
    });
    if(result_code === 'success' && settings !== null)
      return settings;
    else return new Settings();
  }

  save_settings(settings) {
    this.with_local_storage(() => {
      const json_string = JSON.stringify(settings.to_json());
      this.storage.setItem('$settings', json_string);
    });
  }

  // Scan the available localStorage keys and returns the metadata
  // for each file found.
  _fetch_available_file_infos() {
    let file_infos = [];
    // NOTE: localStorage is not iterable directly, so can't use a for-of loop.
    for(let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i) || '';
      const pieces = key.split(':');
      if(pieces.length === 4)
        file_infos.push({
          key: key,
          filename: pieces[0],
          filesize: parseInt(pieces[1]),
          item_count: parseInt(pieces[2]),
          timestamp: parseInt(pieces[3])  // integer milliseconds from epoch
        });
    }
    file_infos.sort((a, b) => {
      // Sort by filename, and if there is more than one key for a given
      // filename (shouldn't happen but might), subsort by timestamp (newest first).
      if(a.filename === b.filename) return b.timestamp - a.timestamp;
      else return a.filename < b.filename ? -1 : 1;
    });
    return file_infos;
  }

  // Filenames can only contain letters and digits and underscores and
  // spaces, and are limited to 100 characters.  Return null if the
  // filename cannot be sanitized.
  sanitize_filename(filename) {
    const fn = filename
          .replaceAll(/[^a-zA-Z0-9_ ]/g, '')
          .trim().slice(0, 100);
    return fn.length === 0 ? null : fn;
  }

  // Used by FileManagerComponent.import_file(), so needs to be its
  // own method.
  decode_app_state_base64(base64_string) {
    return MsgpackDecoder.decode_app_state_base64(base64_string);
  }

  has_file_named(filename) {
    const [result_code, exists] = this.with_local_storage(() => {
      const file_info = this._fetch_available_file_infos()
            .find(file_info => file_info.filename === filename);
      return !!file_info;
    });
    return result_code === 'success' && exists;
  }

  // Return the loaded AppState if successful, null if not.
  load_file(filename) {
    const [result_code, app_state] = this.with_local_storage(() => {
      const file_info = this._fetch_available_file_infos()
            .find(file_info => file_info.filename === filename);
      if(file_info)
        return this.decode_app_state_base64(
          this.storage.getItem(file_info.key));
      else return null;  // file not found, shouldn't normally happen
    });
    return result_code === 'success' ? app_state : null;
  }

  // TODO: factor with load_file()
  fetch_file_base64(filename) {
    const [result_code, base64_string] = this.with_local_storage(() => {
      const file_info = this._fetch_available_file_infos()
            .find(file_info => file_info.filename === filename);
      if(file_info)
        return this.storage.getItem(file_info.key);
    });
    if(result_code === 'success')
      return base64_string;
    else return null;
  }

  // Save an AppState in serialized format with the document metadata
  // in the localStorage key.  Return null on success, or an error message
  // string on failure.
  save_file(filename, app_state) {
    filename = this.sanitize_filename(filename);  // caller should have already done this
    if(!filename) return 'Invalid filename';
    const [result_code, result] = this.with_local_storage(() => {
      const serialized_base64 = MsgpackEncoder
            .encode_app_state_base64(app_state);
      const key = [
        filename,
        serialized_base64.length.toString(),
        app_state.item_count().toString(),
        Date.now().toString()
      ].join(':');
      // Save the new file first (with a 'probably' new key because of the timestamp),
      // then delete the old keys for this filename that don't match the new key.
      this.storage.setItem(key, serialized_base64);
      for(const file_info of this._fetch_available_file_infos())
        if(file_info.filename === filename && file_info.key !== key)
          this.storage.removeItem(file_info.key);
    });
    switch(result_code) {
    case 'success': return null;
    case 'quota_exceeded': return 'Local storage is full';
    case 'error': return result;  // the exception's error message
    }
  }

  rename_file(old_filename, new_filename) {
    not_yet_implemented();
  }

  // Delete the filename from storage.  Return null on success, or an error
  // string on failure.
  delete_file(filename) {
    const old_selected_index = this.selected_file_index();
    const [result_code, result] = this.with_local_storage(() => {
      let any_deleted = false;
      for(const file_info of this._fetch_available_file_infos()) {
        if(file_info.filename === filename) {
          this.storage.removeItem(file_info.key);
          any_deleted = true;
        }
      }
      return any_deleted ? null : 'File not found'
    });
    switch(result_code) {
    case 'success':
      // Select the next available file in the list if deleting the
      // currently-selected file.
      this.refresh_available_files();
      if(filename === this.selected_filename) {
        const new_selected_index =
              Math.max(
                Math.min(old_selected_index === null ? 0 : old_selected_index,
                         this.available_files.length-1), 0);
        this.selected_filename = 
          new_selected_index < this.available_files.length ?
          this.available_files[new_selected_index].filename : null;
      }
      return result;
    case 'quota_exceeded': return 'Local storage is full';  // shouldn't happen since we're deleting
    case 'error': return result;
    }
  }

  // Clear all localStorage.  User settings are in localStorage too,
  // so they need to be re-saved after things are cleared.
  delete_all_files() {
    this.with_local_storage(() => {
      // TODO: If we ever use any non-file keys besides $settings,
      // make sure to preserve them here too.
      const settings_key = '$settings';
      const settings_data = this.storage.getItem(settings_key);
      this.storage.clear();
      this.selected_filename = null;
      if(settings_data)
        this.storage.setItem(settings_key, settings_data);
    });
  }

  // basename -> basename_1
  // basename_1 -> basename_2
  // The first available name is used, so basename_50 -> basename_2
  // if basename_2 is available but basename_1 is taken.
  generate_unused_filename(basename) {
    const file_infos = this._fetch_available_file_infos();
    basename = basename.replace(/_\d+$/, '')
    for(let n = 1; n < 1000; n++) {
      const candidate = basename + '_' + n.toString();
      if(!file_infos.some(file_info => file_info.filename === candidate))
        return candidate;
    }
    return basename + '_toomany';
  }

  // Update this.available_files and this.storage_used
  refresh_available_files() {
    let filenames_set = new Set();
    let index = 0;
    this.available_files = [];
    this.storage_used = 0;
    this.with_local_storage(() => {
      for(const file_info of this._fetch_available_file_infos()) {
        this.storage_used += file_info.filesize;
        if(!filenames_set.has(file_info.filename)) {
          file_info.index = index++;
          filenames_set.add(file_info.filename);
          this.available_files.push(file_info);
        }
      }
    });
    return this.available_files;
  }

  selected_file_index() {
    this.refresh_available_files();
    const file_info = this.available_files
          .find(file_info => file_info.filename === this.selected_filename);
    return file_info ? file_info.index : null;
  }

  // For moving up or down in the list of files.
  select_adjacent_filename(offset) {
    const current_index = this.selected_file_index();
    const new_index = current_index === null ? 0 :
          Math.max(0, Math.min(current_index + offset,
                               this.available_files.length-1));
    this.selected_filename = 
      new_index < this.available_files.length ?
      this.available_files[new_index].filename : null;
    return this.selected_filename;
  }
}


// Represents a "path" within an Expr to one of its subexpressions.
// Each element (index) along the path is an integer identifying one of the
// children of the Expr at that level.
class ExprPath {
  constructor(expr, subexpr_indexes) {
    this.expr = expr;
    this.subexpr_indexes = subexpr_indexes;
  }

  depth() { return this.subexpr_indexes.length; }

  // This comparison is needed by the LatexEmitter to determine when the
  // rendering path matches up with the selected expression path.
  equals(other_path) {
    return this.expr === other_path.expr &&
      this.subexpr_indexes.length === other_path.subexpr_indexes.length &&
      this.subexpr_indexes.every((subexpr_index, i) =>
        subexpr_index === other_path.subexpr_indexes[i]);
  }

  // Return the 'n'th parent of the selected subexpression.
  // n === 0 returns the actual selected subexpression;
  // n === 1 is its first parent, etc.
  last_expr_but(n) {
    let expr = this.expr;
    for(let i = 0; i < this.subexpr_indexes.length-n; i++)
      expr = expr.subexpressions()[this.subexpr_indexes[i]];
    return expr;
  }

  selected_expr() { return this.last_expr_but(0); }

  last_index_but(n) {
    return this.subexpr_indexes[this.subexpr_indexes.length-n];
  }

  // Return a new ExprPath descended into the subexpression of the
  // selected expression indicated by 'index'.
  descend(index) {
    return new ExprPath(
      this.expr,
      this.subexpr_indexes.concat([index]));
  }

  // Return a new ExprPath that selects the parent Expr of the current
  // subexpression(s).
  ascend() {
    return new ExprPath(
      this.expr,
      this.subexpr_indexes.slice(0, -1));
  }

  // Return a new ExprPath that is like this one but with the "sibling" subexpression
  // in the given direction selected.
  // 'direction' can be 'left' or 'right'.  The selection wraps around when going
  // past the ends of the expression.
  move(direction) {
    if(this.depth() === 0)
      return this;  // no siblings at top level
    const parent_expr = this.last_expr_but(1);
    const final_index = this.last_index_but(1);
    const subexpr_count = parent_expr.subexpressions().length;
    let new_index = final_index + (direction === 'right' ? +1 : -1);
    // NOTE: could use % but Javascript returns negative when new_index goes negative.
    // We need it between 0 and subexpr_count-1.
    if(new_index < 0) new_index = subexpr_count-1;
    if(new_index >= subexpr_count) new_index = 0;
    return this.ascend().descend(new_index);
  }

  // Replace the currently selected subexpression with new_expr.
  // This returns a version of the original this.expr, except the
  // indicated subexpression has been replaced by the given expression.
  // The subexpression that has been replaced is still available via this.selected_expr().
  replace_selection(new_expr) {
    if(this.depth() === 0)
      return new_expr;  // special case - "replacing" the base expression
    const parent_expr = this.last_expr_but(1);
    const final_index = this.last_index_but(1);
    let expr = parent_expr.replace_subexpression(final_index, new_expr);
    // Unwind back up the ExprPath "stack" backwards, replacing subexpressions along the way.
    // This is O(n^2) in the depth of the tree structure.  This could be optimized to O(n)
    // by streamlining the repetitive last_*_but() calls.
    for(let i = 2; i <= this.subexpr_indexes.length; i++) {
      const local_parent = this.last_expr_but(i);
      const subexpr_index = this.last_index_but(i);
      expr = local_parent.replace_subexpression(subexpr_index, expr);
    }
    return expr;
  }

  // "Extract" the currently selected subexpression, replacing it with a placeholder
  // where it previously was.
  extract_selection() {
    return this.replace_selection(new PlaceholderExpr());
  }
}


// Conversion of any floating-point values in an Expr to (approximate)
// rational fractions or rational multiples of common numbers like sqrt(2).
class RationalizeToExpr {
  static rationalize_expr(expr, full_size_fraction=true) {
    return new this(full_size_fraction).rationalize_expr(expr);
  }
  
  static rationalize(value, full_size_fraction=true) {
    return new this(full_size_fraction).value_to_expr(value);
  }

  constructor(full_size_fraction) {
    this.full_size_fraction = full_size_fraction;
  }
  
  rationalize_expr(expr) {
    const rationalized_expr = this._try_rationalize_real_expr(expr);
    if(rationalized_expr)
      return rationalized_expr;
    // Check subexpressions recursively.
    return expr.subexpressions().reduce(
      (new_expr, subexpression, subexpression_index) => new_expr
        .replace_subexpression(
          subexpression_index,
          this.rationalize_expr(subexpression)),
      expr);
  }

  _try_rationalize_real_expr(expr) {
    let negated = false;
    if(expr.is_unary_minus_expr()) {
      negated = true;
      expr = expr.base_expr;
    }
    if(expr.is_text_expr() && expr.looks_like_floating_point()) {
      let value = parseFloat(expr.text);
      if(!isNaN(value)) {
        if(negated) value *= -1.0;
        return this.value_to_expr(value);
      }
    }
    return null;
  }
  
  // Try to find a close rational approximation to a floating-point
  // value, or up to a rational factor of some common constants
  // like sqrt(2) or pi.  Return an Expr if successful, otherwise null.
  value_to_expr(value) {
    let result = null;
    const make_sqrt = expr => new CommandExpr('sqrt', [expr]);
    const pi_expr = new CommandExpr('pi');
    const two_pi_expr = Expr.combine_pair(this._int_to_expr(2), pi_expr);
    // Don't try to rationalize anything too large in magnitude.
    if(Math.abs(value) > 1e8)
      return null;
    // Check for very small fractional part; could be either an integer,
    // or a float with large magnitude and thus decayed fractional precision.
    if(Math.abs(value % 1.0) < 0.000001)
      return this._int_to_expr(value);
    // Try different variations on \pi
    // NOTE: pi is a little weird because a close rational approximation 
    // (355/113) both has small denominator and is very close to the actual
    // value of pi.  So the epsilon value in _try_rationalize_with_factor()
    // needs to be chosen carefully.
    result = this._try_rationalize_with_factor(  // pi^2
      value, Math.PI*Math.PI,
      pi_expr.with_superscript(this._int_to_expr(2)));
    result ||= this._try_rationalize_with_factor(  // pi
      value, Math.PI, pi_expr, null);
    result ||= this._try_rationalize_with_factor(  // 1/pi
      value, 1/Math.PI, null, pi_expr);
    result ||= this._try_rationalize_with_factor(  // sqrt(pi)
      value, Math.sqrt(Math.PI), make_sqrt(pi_expr), null);
    result ||= this._try_rationalize_with_factor(  // 1 / \sqrt(pi)
      value, 1/Math.sqrt(Math.PI), null, make_sqrt(pi_expr));
    result ||= this._try_rationalize_with_factor(  // \sqrt(2pi)
      value, Math.sqrt(2*Math.PI), make_sqrt(two_pi_expr), null);
    result ||= this._try_rationalize_with_factor(  // 1 / \sqrt(2pi)
      value, 1/Math.sqrt(2*Math.PI), null, make_sqrt(two_pi_expr));
    // Try factors of ln(2).
    result ||= this._try_rationalize_with_factor(
      value, Math.log(2), new CommandExpr('ln', [this._int_to_expr(2)]), null);
    // Try sqrt(n) in the numerator for small square-free n.
    // No need to check denominators since, e.g. 1/sqrt(3) = sqrt(3)/3
    const small_squarefree = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19];
    for(let i = 0; i < small_squarefree.length; i++)
      result ||= this._try_rationalize_with_factor(
        value, Math.sqrt(small_squarefree[i]),
        make_sqrt(this._int_to_expr(small_squarefree[i])), null);
    // Try golden ratio-like factors.
    result ||= this._try_rationalize_with_factor(
      value, 1+Math.sqrt(5),
      InfixExpr.add_exprs(this._int_to_expr(1), make_sqrt(this._int_to_expr(5))),
      null);
    result ||= this._try_rationalize_with_factor(
      value, Math.sqrt(5)-1,  // NOTE: keep positive sign, 1-sqrt(5) is negative
      InfixExpr.combine_infix(
        make_sqrt(this._int_to_expr(5)),
        this._int_to_expr(1),
        new TextExpr('-')),
      null);
    // NOTE: factors of e^n (n!=0) are rare in isolation so don't test for them here.
    // Finally, rationalize the number itself with no factors.
    result ||= this._try_rationalize_with_factor(value, 1.0, null, null);
    return result;
  }

  // Helper for rationalize_to_expr().
  // Try to pull out rational multiples of 'factor' using Farey fractions.
  // If successful, return the factored rational expression,
  // multiplied by 'numer_factor_expr' in the numerator or
  // 'denom_factor_expr' in the denominator if they are given.
  // If no rationalization close enough can be found, return null.
  _try_rationalize_with_factor(value, factor, numer_factor_expr, denom_factor_expr) {
    const x = value / factor;
    const max_denom = 1000;  // maximum denominator tolerated
    const epsilon = 0.00000001;  // maximum deviation from true value tolerated
    const sign = Math.sign(value);
    const x_abs = Math.abs(x);
    const [integer_part, fractional_part] = [Math.floor(x_abs), x_abs % 1.0];
    const [numer, denom] = this._rationalize(fractional_part, max_denom);
    const rationalized_value = numer/denom;
    if(Math.abs(rationalized_value - fractional_part) < epsilon) {
      // This is a close enough rational approximation that it can be considered exact.
      const final_numer = integer_part*denom + numer;
      const final_denom = denom;
      let final_expr = null;
      if(final_denom === 1) {
        // Integer multiple of the factor.
        const base_expr = this._int_to_expr(final_numer*sign);
        if(numer_factor_expr) {
          if(final_numer === 1) {
            if(sign < 0)
              final_expr = PrefixExpr.unary_minus(numer_factor_expr);
            else final_expr = numer_factor_expr;
          }
          else final_expr = Expr.combine_pair(base_expr, numer_factor_expr);
        }
        else if(denom_factor_expr)
          final_expr = CommandExpr.frac(base_expr, denom_factor_expr);
        else
          final_expr = base_expr;
      }
      else {
        // Rational (but not integer) multiple of the factor.
        let numer_expr = this._int_to_expr(final_numer);
        if(numer_factor_expr) {
          if(final_numer === 1)
            numer_expr = numer_factor_expr;
          else
            numer_expr = Expr.combine_pair(numer_expr, numer_factor_expr);
        }
        let denom_expr = this._int_to_expr(final_denom);
        if(denom_factor_expr)
          denom_expr = Expr.combine_pair(denom_expr, denom_factor_expr);
        const frac_expr = CommandExpr.frac(numer_expr, denom_expr);
        if(sign < 0)
          final_expr = PrefixExpr.unary_minus(frac_expr);
        else final_expr = frac_expr;
      }
      return final_expr;
    }
    else
      return null;  // not close enough to a rational multiple of factor
  }

  // Farey fraction algorithm.  Find closest rational approximation to
  // 0 <= x <= 1, with maximum denominator max_denom.
  // Returns [numerator, denominator].
  _rationalize(x, max_denom) {
    const eps = 1e-6;
    let [a, b, c, d] = [0, 1, 1, 1];
    while(b <= max_denom && d <= max_denom) {
      const mediant = (a+c) / (b+d);
      if(Math.abs(x - mediant) <= eps) {
        if(b + d <= max_denom)
          return [a+c, b+d];
        else if(d > b)
          return [c, d];
        else
          return [a, b];
      }
      else if(x > mediant)
        [a, b] = [a+c, b+d];
      else
        [c, d] = [a+c, b+d];
    }
    if(b > max_denom)
      return [c, d];
    else
      return [a, b];
  }

  // If we "know" x should be an integer (e.g. as part of a rationalized fraction),
  // this function is used to try to show it without any decimal part.
  // Very large or small-but-nonzero values are shown in scientific notation.
  _int_to_expr(x) {
    if(isNaN(x))
      return FontExpr.roman_text('NaN');
    else if(Math.abs(x) > 1e12)
      return double_to_expr(x);  // use scientific notation
    else
      return TextExpr.integer(Math.round(x));
  }
}


// Represents an entry in the stack or document.
class Item {
  // Used for React collection keys.  Each entry in a React component list is
  // supposed to have a unique ID.
  // NOTE: iOS Safari doesn't seem to like static variables like this?
  // As a workaround, this will be initialized after the class definition instead.
  //static serial_number = 1;
  static next_serial() { return Item.serial_number++; }

  // 'tag_string' is an optional tag shown to the right of the item.
  // 'source_string' is the original "source code" string for items
  // that were created in the minieditor.
  constructor(tag_string, source_string) {
    this.serial = Item.next_serial();
    this.tag_string = tag_string;
    this.source_string = source_string;
  }

  react_key(prefix) { return prefix + '_' + this.serial; }

  // Subclasses must override this.
  item_type() { return '???'; }

  is_expr_item() { return this.item_type() === 'expr'; }
  is_text_item() { return this.item_type() === 'text'; }

  // Return a new Item of the same type and contents (shallow copy) but with a new serial_number.
  // This is mainly needed for React, which needs a distinct React key for each item in
  // a list (like the list of stack items).  Things like 'dup' that can duplicate items
  // need to make sure to use clone() so that every Item in the stack/document is distinct.
  clone() { return null; }
}

// iOS Safari workaround
Item.serial_number = 1;


// Represents a math expression (Expr instance) in the stack or document.
class ExprItem extends Item {
  // 'selected_expr_path' is an optional ExprPath object; the indicated subexpression(s)
  // will be highlighted in a "selected" style by the renderer.
  constructor(expr, tag_string, source_string, selected_expr_path) {
    super(tag_string, source_string);
    this.expr = expr;
    this.selected_expr_path = selected_expr_path;
  }

  item_type() { return 'expr'; }

  to_latex(export_mode) {
    const rendered_latex = this.expr.to_latex(this.selected_expr_path, export_mode);
    if(export_mode)
      return ["$$\n", rendered_latex, "\n$$"].join('');
    else
      return rendered_latex;
  }

  clone() {
    return new ExprItem(this.expr, this.tag_string, this.source_string);
  }

  as_bold() {
    return new ExprItem(this.expr.as_bold(), this.tag_string, this.source_string);
  }
  
  with_tag(new_tag_string) {
    return new ExprItem(this.expr, new_tag_string, this.source_string);
  }
}


// A TextItem contains a list of TextItemElement subclass instances.
//   - TextItemExprElement - wraps a Expr object to be rendered inline with the text
//   - TextItemTextElement - a string of text to be rendered as \text{...} command(s)
//   - TextItemRawElement - a string of text to be rendered directly (mostly a special
//     case to support combining math and text with infix operators)
class TextItemElement {
  is_text() { return false; }
  is_expr() { return false; }
  is_raw() { return false; }
}


class TextItemTextElement extends TextItemElement {
  // Bold/italic fonts are handled specially for text items.
  // Bold and italic words are put inside \textbf{} and \textit{} commands
  // instead of \text{}.  Currently bold and italic at once is not supported.
  // TODO: 'is_underlined' is unimplemented but the flag reserved for
  // future use in the msgpack encoding.
  constructor(text, is_bold, is_italic, is_underlined) {
    super();
    this.text = text;
    this.is_bold = !!is_bold;
    this.is_italic = !!is_italic;
    this.is_underlined = !!is_underlined;
  }

  is_text() { return true; }
  as_bold() { return new TextItemTextElement(this.text, true); }

  to_latex(export_mode) {
    if(export_mode)
      return this.to_latex_export_mode();
    else
      return this.to_latex_display_mode();
  }

  to_latex_display_mode() {
    // This is a little messy because of how KaTeX handles line breaks.
    // Normally, breaks are only allowed after operators like +, but when
    // rendering TextItems, we want to allow breaks after each word.
    // As a workaround, a separate \text{...} command is created for each
    // word followed by \allowbreak commands.  \allowbreak does not work
    // inside the actual \text{...}, otherwise we could presumably just output
    // \text{word1\allowbreak word2\allowbreak}.
    const tokens = this.text.split(/ +/);
    let pieces = [];
    for(let i = 0; i < tokens.length; i++) {
      if(this.is_bold && this.is_italic) pieces.push("\\textbf{\\textit{");
      else if(this.is_bold) pieces.push("\\textbf{");
      else if(this.is_italic) pieces.push("\\textit{");
      else pieces.push("\\text{");
      pieces.push(this._latex_escape(tokens[i]));
      if(i < tokens.length-1) pieces.push(' ');  // preserve spacing between words
      if(this.is_bold && this.is_italic) pieces.push("}");
      // An extra empty group {} is needed to prevent the \allowbreak from possibly
      // running into the next text element.
      pieces.push("}\\allowbreak{}");
    }
    return pieces.join('');
  }

  // For "export" mode, we can skip the \allowbreak hacks used for "display" mode,
  // and there is no need to wrap ordinary text in \text{...} (only bold/italic).
  to_latex_export_mode() {
    let pieces = [];
    if(this.is_bold && this.is_italic) pieces.push("\\textbf{\\textit{");
    else if(this.is_bold) pieces.push("\\textbf{");
    else if(this.is_italic) pieces.push("\\textit{");
    pieces.push(this._latex_escape(this.text));
    if(this.is_bold && this.is_italic) pieces.push("}}");
    else if(this.is_bold || this.is_italic) pieces.push("}");
    return pieces.join('');
  }

  // Special escape sequences are needed within \text{...} commands.
  // This is a quirk of TeX/LaTeX.
  _latex_escape(text) {
    // TODO: make this table a global (or switch statement) so it doesn't constantly get remade
    const replacements = {
      '_': "\\_",
      '^': "\\textasciicircum",
      '%': "\\%",
      '$': "\\$",
      '&': "\\&",
      '#': "\\#",
      '}': "\\}",
      '{': "\\{",
      '~': "\\textasciitilde",
      "\\": "\\textbackslash "
    };
    return text.replaceAll(/[_^%$&#}{~\\]/g, match => replacements[match]);
  }
}


// An Expr embedded in a TextItem.
class TextItemExprElement extends TextItemElement {
  constructor(expr) { super(); this.expr = expr; }
  is_expr() { return true; }
  as_bold() { return new TextItemExprElement(this.expr.as_bold()); }

  to_latex(export_mode) {
    if(export_mode) {
      // When "exporting", we're not in display-math mode (i.e. not within $$ ... $$).
      // So embedded Exprs need to explicitly enter inline-math mode ($ ... $).
      return ['$', this.expr.to_latex(null, true), '$'].join('');
    }
    else {
      // In "display" mode, we're implicitly in math mode because it's being rendered
      // with KaTeX, so the expression can just be emitted directly.
      // An empty latex group {} needs to be inserted after this element,
      // to prevent, e.g. an adjacent "\to" and "x" from becoming "\tox".
      return this.expr.to_latex(null, false) + '{}';
    }
  }
}


// A "raw" piece of LaTeX text (similar to TextExpr) within a TextItem.
// This is used for things like combining a TextItem and ExprItem with an infix operator.
// TextItemTextElement can't be used for the infix itself because we don't want to wrap it
// in a \text{...} and we don't want to escape the operator's actual LaTeX command.
class TextItemRawElement extends TextItemElement {
  constructor(string) { super(); this.string = string; }
  is_raw() { return true; }
  as_bold() { return this; }
  to_latex(export_mode) { return this.string; }
  is_explicit_space() { return this.string === "\\,"; }
}


class TextItem extends Item {
  static from_expr(expr) {
    return new this([new TextItemExprElement(expr)]);
  }

  static from_string(string) {
    return new this(
      [new TextItemTextElement(string)],
      null /* tag_string */, string);
  }

  // "Separators" are currently implemented as empty TextItems with is_heading=true.
  // cf. TextItem.is_empty()
  static separator_item() { return new TextItem([], null, '', true); }

  // "Parse" a string which may or may not contain certain escape sequences:
  //    **bold text** - Converts into a bolded TextItemTextElement
  //    //italic text// - Converts into an italic TextItemTextElement
  //    [] - Converts into a TextItemExprElement wrapping a PlaceholderExpr
  //    $x+y$ - Converts into TextItemExprElement with an inline math expression
  //            as parsed by Algebrite (limited functionality).
  //            If the parsing fails (invalid syntax), null is returned.
  // A TextItem with the parsed elements is returned, or null on failure.
  static parse_string(s) {
    let tokens = this.tokenize_string(s);
    // Add a fake $ token at the end in order to auto-close math mode (e.g. 'test $x+y').
    tokens.push({type: 'math_mode', text: '$'});
    let is_bold = false;
    let is_italic = false;
    let math_mode = false;
    let math_pieces = null;
    let elements = [];
    for(let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if(token.type === 'math_mode') {
        if(math_mode) {
          // Switching out of math mode ($).  All tokens that were between
          // the two $'s are combined into the math expression to be parsed.
          // It's done this way in case there is something like $x//y$ which
          // would normally get confused as the italic '//' token.
          const math_text = math_pieces.join('');
          if(math_text.trim().length > 0) {
            let math_expr = AlgebriteInterface.parse_string(math_text);
            if(!math_expr)
              return null;  // entire TextItem parsing fails if inline math exprs fail
            if(is_bold)
              math_expr = math_expr.as_bold();  // NOTE: italic flag ignored
            elements.push(new TextItemExprElement(math_expr));
          }
        }
        else  // switching into math mode
          math_pieces = [];  // start accumulating text pieces inside $...$
        math_mode = !math_mode;
      }
      else if(math_mode)  // inside $...$
        math_pieces.push(token.text);
      else switch(token.type) {
        case 'bold':
          is_bold = !is_bold; break;
        case 'italic':
          is_italic = !is_italic; break;
        case 'placeholder':
          elements.push(new TextItemExprElement(
            is_bold ? (new PlaceholderExpr()).as_bold() : new PlaceholderExpr()));
          break;
        case 'text':
          elements.push(new TextItemTextElement(token.text, is_bold, is_italic));
          break;
        default:
          break;
      }
    }
    if(elements.length > 0)
      return new this(elements, null /* tag */, s /* source */);
    else return null;  // could happen for '$', '$$$', etc.
  }

  // Tokenize 's' into a token sequence usable by TextItem.parse_string().
  static tokenize_string(s) {
    let tokens = [];
    let pos = 0;
    while(pos < s.length) {
      const ch = s[pos];
      let token = null;
      if(pos < s.length-1) {
        // Check for length-2 tokens.
        const ch2 = s[pos+1];
        if(ch === '[' && ch2 === ']') token = {'type': 'placeholder', 'text': '[]'};
        else if(ch === '*' && ch2 === '*') token = {'type': 'bold', 'text': '**'};
        else if(ch === '/' && ch2 === '/') token = {'type': 'italic', 'text': '//'};
      }
      if(token)
        pos += 2;
      else {
        // Length-1 token.
        if(ch === '$') token = {'type': 'math_mode', 'text': '$'};
        else token = {'type': 'text', 'text': ch};
        pos++;
      }
      tokens.push(token);
    }
    // Coalesce sequences of single-character 'text' tokens into
    // a single 'text' token.
    let new_tokens = [];
    let i = 0;
    while(i < tokens.length) {
      if(tokens[i].type === 'text') {
        let chars = [];
        while(i < tokens.length && tokens[i].type === 'text')
          chars.push(tokens[i++].text);
        new_tokens.push({'type': 'text', 'text': chars.join('')});
      }
      else new_tokens.push(tokens[i++]);
    }
    return new_tokens;
  }
  
  // item1/2 can each be TextItems or ExprItems (caller must check).
  static concatenate_items(item1, item2, separator_text) {
    if(item1.is_expr_item()) item1 = TextItem.from_expr(item1.expr);
    if(item2.is_expr_item()) item2 = TextItem.from_expr(item2.expr);
    const elements = item1.elements.concat(
      separator_text ? [new TextItemRawElement(separator_text)] : [],
      item2.elements);
    // Coalesce adjacent elements.  Rules are:
    //   - Adjacent TextElements are concatenated directly as long as their
    //     is_bold and is_italic flags match.
    //   - A RawElement representing an explicit space character (\,) is absorbed into an
    //     adjacent TextElement as a normal space character (this is to make the spacing
    //     less weird when attaching a text and expression via an infix space).
    let merged_elements = [];
    if(elements.length > 0)
      merged_elements.push(elements[0]);
    for(let i = 1; i < elements.length; i++) {
      const last_index = merged_elements.length-1;
      const last_merged_element = merged_elements[last_index];
      if(last_merged_element.is_text() && elements[i].is_text() &&
         last_merged_element.is_bold === elements[i].is_bold &&
         last_merged_element.is_italic === elements[i].is_italic) {
        // Two adjacent TextElements with the same is_bold/is_italic flags.
        merged_elements[last_index] = new TextItemTextElement(
          last_merged_element.text + elements[i].text,
          elements[i].is_bold, elements[i].is_italic);
      }
      else if(last_merged_element.is_raw() &&
              last_merged_element.is_explicit_space() &&
              elements[i].is_text()) {
        // Raw space + TextElement
        merged_elements[last_index] = new TextItemTextElement(
          ' ' + elements[i].text,
          elements[i].is_bold, elements[i].is_italic);
      }
      else if(last_merged_element.is_text() &&
              elements[i].is_raw() &&
              elements[i].is_explicit_space()) {
        // TextElement + raw space
        merged_elements[last_index] = new TextItemTextElement(
          last_merged_element.text + ' ',
          last_merged_element.is_bold, last_merged_element.is_italic);
      }
      else {
        // Any other combinations are left alone.
        merged_elements.push(elements[i]);
      }
    }
    return new TextItem(
      merged_elements,
      null, null,  /* tag and source string */
      item1.is_heading || item2.is_heading);
  }

  constructor(elements, tag_string, source_string, is_heading) {
    super(tag_string, source_string);
    this.elements = elements;
    this.is_heading = !!is_heading;
  }

  item_type() { return 'text'; }

  // Empty TextItems are displayed as "separator lines" (visually, the underline part
  // of an ordinary section header).  Currently empty TextItems can only be created by
  // the ['][=] and [Tab][=] commands, and they are always created with is_heading=true.
  // There is a slight corner case here if is_header flag is turned off via [/]["].
  // That case "should" display as a truly empty item, but for now we avoid this by
  // just disallowing turning off the is_header flag in [/]["] (do_toggle_is_heading).
  is_empty() { return this.elements.length === 0; }

  to_latex(export_mode) {
    if(this.is_empty())
      return "\\rule";  // separator
    else
      return this.elements.map(
        element => element.to_latex(export_mode)).join('');
  }

  clone() {
    return new TextItem(
      this.elements,
      this.tag_string,
      this.source_string,
      this.is_heading);
  }

  // Return a clone of this with all elements bolded.
  as_bold() {
    return new TextItem(
      this.elements.map(element => element.as_bold()),
      this.tag_string,
      this.source_string,
      this.is_heading);
  }

  with_tag(new_tag_string) {
    return new TextItem(
      this.elements,
      new_tag_string,
      this.source_string,
      this.is_heading);
  }

  // If there is any PlaceholderExpr among the elements in this TextItem, substitute
  // the first one for substitution_expr and return the new TextItem.
  // If there are no PlaceholderExprs available, return null.
  try_substitute_placeholder(substitution_expr) {
    let new_elements = [...this.elements];
    for(let i = 0; i < new_elements.length; i++) {
      if(new_elements[i].is_expr()) {
        const placeholder_expr_path = new_elements[i].expr.find_placeholder_expr_path();
        if(placeholder_expr_path !== null) {
          const new_expr = placeholder_expr_path.replace_selection(substitution_expr);
          new_elements[i] = new TextItemExprElement(new_expr);
          return new TextItem(new_elements, this.tag_string, this.source_string, this.is_heading);
        }
      }
    }
    return null;
  }
}


// Source code item.  Currently only used and created by [Tab][$] (do_extract_latex_source)
// and no operations are supported on these items.
class CodeItem extends Item {
  static from_latex_string(s) { return new CodeItem('latex', s); }

  constructor(language, source) {
    super();
    this.language = language;
    this.source = source;
  }

  item_type() { return 'code'; }

  to_latex(export_mode) {
    if(this.language === 'latex')
      return this.source;
    else
      return '???';
  }

  clone() { return new CodeItem(this.language, this.source); }

  as_bold() { return this.clone(); }
}


// The item stack.  This is never modified in-place; all stack operations
// return a new Stack with the modified items, leaving the original untouched.
class Stack {
  // NOTE: floating_item is a temporary holding slot to keep an item off to
  // the side, as a user convenience.
  constructor(items, floating_item) {
    this.items = items || [];
    this.floating_item = floating_item;
  }

  depth() { return this.items.length; }
  check(n) { return this.depth() >= n; }

  // Check that at least n items are available and that they are all ExprItems.
  check_exprs(n) {
    if(!this.check(n)) return false;
    for(let i = 0; i < n; i++)
      if(this.items[this.items.length-1-i].item_type() !== 'expr')
        return false;
    return true;
  }

  // Fetch item at position n (stack top = 1, next = 2, etc).
  peek(n = 1) {
    if(!this.check(n)) this.underflow();
    return this.items[this.items.length - n];
  }

  // Returns [new_stack, item1, item2, ...].
  pop(n=1) {
    if(!this.check(n)) this.underflow();
    return this._unchecked_pop(n);
  }

  // Like pop(n) but all the items have to be ExprItems, and the wrapped Expr
  // instances are returned, not the ExprItems.
  pop_exprs(n = 1) {
    if(!this.check(n)) this.underflow();
    if(!this.check_exprs(n)) this.type_error();
    const [new_stack, ...items] = this._unchecked_pop(n);
    return [new_stack, ...items.map(item => item.expr)];
  }

  pop_arrays(n) {
    const [new_stack, ...exprs] = this.pop_exprs(n);
    if(exprs.every(expr => expr.is_array_expr()))
      return [new_stack, ...exprs];
    else this.type_error();
  }

  pop_matrices(n) {
    const [new_stack, ...exprs] = this.pop_exprs(n);
    if(exprs.every(expr => expr.is_matrix_expr()))
      return [new_stack, ...exprs];
    else this.type_error();
  }

  _unchecked_pop(n) {
    if(n <= 0)
      return [this];
    else
      return [
        new Stack(this.items.slice(0, -n), this.floating_item)
      ].concat(this.items.slice(-n));
  }
  
  push_all(items) {
    if(!items.every(item => item instanceof Item))
      throw new Error('pushing invalid item onto stack');
    return new Stack(this.items.concat(items), this.floating_item);
  }
  
  push_all_exprs(exprs) { return this.push_all(exprs.map(expr => new ExprItem(expr))); }
  push(item) { return this.push_all([item]); }
  push_expr(expr) { return this.push_all_exprs([expr]); }

  set_floating_item(new_item) { return new Stack(this.items, new_item); }

  // Return a new Stack with cloned copies of all the items.
  // The cloned items will have new React IDs, which will force a re-render of the items.
  // This is used for things like changing between display and inline math mode, where
  // the item content doesn't change but the way it's rendered does.
  clone_all_items() {
    return new Stack(
      this.items.map(item => item.clone()),
      this.floating_item ? this.floating_item.clone() : null);
  }

  underflow() { throw new Error('stack_underflow'); }
  type_error() { throw new Error('stack_type_error'); }
}


// The document item list.  Like Stack, all Document operations are non-destructive
// and return a new Document reflecting the changes.
class Document {
  // NOTE: selection_index can be in the range 0..items.length (inclusive).
  constructor(items, selection_index) {
    this.items = items || [];
    this.selection_index = selection_index || 0;
  }

  selected_item() {
    if(this.selection_index > 0)
      return this.items[this.selection_index-1];
    else
      return null;
  }

  // Insert one or more items below the current selection.
  // The last inserted item becomes the new selection.
  insert_items(new_items) {
    const index = this.selection_index;
    return new Document(
      [...this.items.slice(0, index),  // TODO: use toSpliced() (check compatibility)
       ...new_items,
       ...this.items.slice(index)],
      index+new_items.length);
  }

  // Delete one or more items starting at the current selection index and
  // working backwards (to match the insertion order of insert_items()).
  // Returns [new_document, deleted_items].
  // Deleting at selection_index 0 (the top "spacer") is silently ignored.
  // Trying to delete more items than there are available trims the item_count
  // to match what is actually available.  After the deletion, the item before
  // the old selection_index will become selected (possibly the top spacer).
  delete_selection(item_count = 1) {
    const index = this.selection_index;
    if(index === 0)
      return [this, []];
    if(item_count > index)
      item_count = index;
    const new_items = [
      ...this.items.slice(0, index-item_count),
      ...this.items.slice(index)];
    const deleted_items = this.items.slice(index-item_count, index);
    return [
      new Document(new_items, index-item_count),
      deleted_items];
  }

  move_selection_by(offset) {
    let new_index = this.selection_index + offset;
    if(new_index < 0) new_index = 0;
    if(new_index > this.items.length) new_index = this.items.length;
    return new Document(this.items, new_index);
  }

  // If there is a current selection, move it by the given offset.
  // Returns null if trying to shift out-of-bounds.
  shift_selection_by(offset) {
    const item = this.selected_item();
    if(!item ||
       this.selection_index + offset <= 0 ||
       this.selection_index + offset > this.items.length)
      return null;
    else {
      const new_document = this.delete_selection()[0];
      return new_document.move_selection_by(offset).insert_items([item]);
    }
  }

  // See Stack.clone_all_items()
  clone_all_items() {
    return new Document(
      this.items.map(item => item.clone()),
      this.selection_index);
  }
}


// Serialize (encode) the app state (stack, document, and all their contents)
// into 'msgpack' format (https://msgpack.org/).  This is a compact binary
// representation suitable for storage.
//
// For Expr objects, the general format is [expr_type_code, ...expr_state].
// For example, a TextExpr('abc') becomes [1, 'abc'] (and then encoded by
// by msgpack).  In JSON, this would instead be:
// { 'expr_type': 'text', 'text': 'abc' } which is much longer and contains
// repetitive strings like 'expr_type'.  The msgpack format takes roughly
// 15-20% the space of JSON, even after Base64 encoding.
//
// Base64 encoding is needed if saving to localStorage which doesn't support raw
// binary strings/arrays.  IndexedDB allows it, but Base64 is used for that too
// for simplicity.
//
// MsgpackDecoder can be used to reconstitute the serialized objects.
class MsgpackEncoder {
  // Encode an entire AppState, returning a binary Uint8Array.
  static encode_app_state_binary(app_state) {
    return msgpack_encode(
      new this().pack_app_state(app_state),
      {'maxDepth': 200});
  }

  // Like encode_app_state_binary() but return an ordinary String
  // in base64 encoding.  This can be used for storage methods that
  // only accept UTF-8 strings like the browser's localStorage
  // (or for things like pasting into emails).
  static encode_app_state_base64(app_state) {
    return this.split_lines(
      this.encode_app_state_binary(app_state).toBase64());
  }

  // Encode a single Item (only used for debugging currently).
  static encode_item_base64(item) {
    return this.split_lines(
      msgpack_encode(new this().pack_item(item)).toBase64());
  }

  // Break a (base64-encoded) string into separate lines for "readability".
  static split_lines(s, line_length = 64) {
    let lines = [];
    for(let i = 0; i < s.length; i += line_length)
      lines.push(s.slice(i, i+line_length));
    return lines.join("\n");
  }
  
  pack_app_state(app_state) {
    return [
      1,  // version code
      'rpnlatex',  // magic identifier
      this.pack_stack(app_state.stack),
      this.pack_document(app_state.document)];
  }
  pack_stack(stack) {
    return [
      stack.floating_item ? this.pack_item(stack.floating_item) : null,
      stack.items.map(item => this.pack_item(item))];
  }
  pack_document(document) {
    return [
      document.selection_index,
      document.items.map(item => this.pack_item(item))];
  }

  // Item subclasses:
  pack_item(item) {
    switch(item.item_type()) {
    case 'expr': return this.pack_expr_item(item);
    case 'text': return this.pack_text_item(item);
    case 'code': return this.pack_code_item(item);
    default:
      throw new Error("Unknown Item type in MsgpackEncoder: " + item.item_type());
    }
  }
  pack_expr_item(item) {
    return [
      1, this.pack_expr(item.expr),
      item.tag_string, item.source_string];
  }
  pack_text_item(item) {
    return [
      2, item.elements.map(element => this.pack_text_item_element(element)),
      item.tag_string, item.source_string, item.is_heading];
  }
  pack_code_item(item) {
    return [3, item.language, item.source];
  }

  // TextItemElement subclasses:
  pack_text_item_element(element) {
    if(element.is_text()) return this.pack_text_item_text_element(element);
    else if(element.is_expr()) return this.pack_text_item_expr_element(element);
    else if(element.is_raw()) return this.pack_text_item_raw_element(element);
    else this.error("Unknown TextItemElement type");
  }
  pack_text_item_text_element(element) {
    return [1, element.text, element.is_bold,
            element.is_italic, element.is_underlined];
  }
  pack_text_item_expr_element(element) {
    return [2, this.pack_expr(element.expr)];
  }
  pack_text_item_raw_element(element) {
    return [3, element.string];
  }

  // Convert an Expr into a (possibly nested) array of basic values like
  // strings and numbers.  Each Expr subclass is assigned a typecode that
  // identifies the class.  This is done explicitly here instead of via inherited
  // methods in Expr classes to keep things cleaner and make it easier to handle
  // possible new versions of the binary format (new versions can be implemented
  // as subclasses of MsgpackEncoder/Decoder).
  pack_expr(expr) {
    switch(expr.expr_type()) {
    case 'text': return this.pack_text_expr(expr);
    case 'command': return this.pack_command_expr(expr);
    case 'sequence': return this.pack_sequence_expr(expr);
    case 'delimiter': return this.pack_delimiter_expr(expr);
    case 'subscriptsuperscript': return this.pack_subscriptsuperscript_expr(expr);
    case 'infix': return this.pack_infix_expr(expr);
    case 'prefix': return this.pack_prefix_expr(expr);
    case 'postfix': return this.pack_postfix_expr(expr);
    case 'font': return this.pack_font_expr(expr);
    case 'placeholder': return this.pack_placeholder_expr(expr);
    case 'function_call': return this.pack_function_call_expr(expr);
    case 'array': return this.pack_array_expr(expr);
    default:
      throw new Error("Unknown Expr type in MsgpackEncoder: " + expr.expr_type());
    }
  }
  pack_text_expr(expr) { return [1, expr.text]; }
  pack_command_expr(expr) {
    return [
      2, expr.command_name,
      expr.operand_exprs.length > 0 ?
        expr.operand_exprs.map(operand_expr => this.pack_expr(operand_expr)) : null,
      expr.options];
  }
  pack_sequence_expr(expr) {
    return [3, expr.exprs.map(subexpr => this.pack_expr(subexpr))];
  }
  pack_delimiter_expr(expr) {
    return [
      4, expr.left_type, expr.right_type,
      this.pack_expr(expr.inner_expr), expr.fixed_size];
  }
  pack_subscriptsuperscript_expr(expr) {
    return [
      5, this.pack_expr(expr.base_expr),
      expr.subscript_expr ? this.pack_expr(expr.subscript_expr) : null,
      expr.superscript_expr ? this.pack_expr(expr.superscript_expr) : null];
  }
  pack_infix_expr(expr) {
    return [
      6,
      expr.operand_exprs.map(operand_expr => this.pack_expr(operand_expr)),
      expr.operator_exprs.map(operator_expr => this.pack_expr(operator_expr)),
      expr.split_at_index,
      expr.linebreaks_at.length === 0 ? null : expr.linebreaks_at];
  }
  pack_prefix_expr(expr) {
    return [
      7, this.pack_expr(expr.base_expr),
      this.pack_expr(expr.operator_expr)];
  }
  pack_postfix_expr(expr) {
    return [
      8, this.pack_expr(expr.base_expr),
      this.pack_expr(expr.operator_expr)];
  }
  pack_font_expr(expr) {
    return [
      9, this.pack_expr(expr.expr),
      expr.typeface, expr.is_bold, expr.size_adjustment];
  }
  pack_placeholder_expr(expr) { return [10]; }
  pack_function_call_expr(expr) {
    return [
      11, this.pack_expr(expr.fn_expr),
      this.pack_expr(expr.args_expr)];
  }
  pack_array_expr(expr) {
    return [
      12, expr.array_type,
      expr.row_count, expr.column_count,
      expr.element_exprs.map(row_exprs =>
        row_exprs.map(element_expr => this.pack_expr(element_expr))),
      expr.row_separators.some(sep => sep !== null) ? expr.row_separators : null,
      expr.column_separators.some(sep => sep !== null) ? expr.column_separators : null];
  }
}


// Unserialize the AppState from msgpack format.
class MsgpackDecoder {
  static decode_app_state_binary(uint8_array) {
    const packed = msgpack_decode(uint8_array);
    return new this().unpack_app_state(packed);
  }

  static decode_app_state_base64(base64_string) {
    const encoded = Uint8Array.fromBase64(this.unsplit_lines(base64_string));
    return this.decode_app_state_binary(encoded);
  }

  static decode_item_base64(base64_string) {
    const encoded = Uint8Array.fromBase64(this.unsplit_lines(base64_string));
    const packed = msgpack_decode(encoded);
    return new this().unpack_item(packed);
  }

  static unsplit_lines(s) {
    return s.replaceAll("\n", '');
  }

  error(msg) { throw new Error(msg); }

  unpack_app_state([version_code, magic, stack_state, document_state]) {
    if(version_code !== 1) this.error("Unsupported version code: " + version_code);
    if(magic !== 'rpnlatex') this.error("Invalid magic identifier");
    return new AppState(
      this.unpack_stack(stack_state),
      this.unpack_document(document_state));
  }
  unpack_stack([floating_item_state, item_states]) {
    return new Stack(
      item_states.map(item_state => this.unpack_item(item_state)),
      floating_item_state ? this.unpack_item(floating_item_state) : null);
  }
  unpack_document([selection_index, item_states]) {
    return new Document(
      item_states.map(item_state => this.unpack_item(item_state)),
      selection_index);
  }

  unpack_item([type_code, ...item_state]) {
    switch(type_code) {
    case 1: return this.unpack_expr_item(item_state);
    case 2: return this.unpack_text_item(item_state);
    case 3: return this.unpack_code_item(item_state);
    default: this.error("Unknown Item typecode in MsgpackDecoder: " + type_code);
    }
  }
  unpack_expr_item([expr_state, tag_string, source_string]) {
    return new ExprItem(
      this.unpack_expr(expr_state),
      tag_string, source_string);
  }
  unpack_text_item([element_states, tag_string, source_string, is_heading]) {
    return new TextItem(
      element_states.map(element_state => this.unpack_text_item_element(element_state)),
      tag_string, source_string, is_heading);
  }
  unpack_code_item([language, source]) {
    return new CodeItem(language, source);
  }
  unpack_text_item_element([type_code, ...element_state]) {
    switch(type_code) {
    case 1: return this.unpack_text_item_text_element(element_state);
    case 2: return this.unpack_text_item_expr_element(element_state);
    case 3: return this.unpack_text_item_raw_element(element_state);
    default: this.error("Unknown TextItemElement typecode in MsgpackDecoder: " + type_code);
    }
  }
  unpack_text_item_text_element([text, is_bold, is_italic, is_underlined]) {
    return new TextItemTextElement(text, is_bold, is_italic, is_underlined);
  }
  unpack_text_item_expr_element([expr_state]) {
    return new TextItemExprElement(this.unpack_expr(expr_state));
  }
  unpack_text_item_raw_element([string]) {
    return new TextItemRawElement(string);
  }

  unpack_expr(array) {
    const [typecode, ...state] = array;
    switch(typecode) {
    case 1:  return this.unpack_text_expr(state);
    case 2:  return this.unpack_command_expr(state);
    case 3:  return this.unpack_sequence_expr(state);
    case 4:  return this.unpack_delimiter_expr(state);
    case 5:  return this.unpack_subscriptsuperscript_expr(state);
    case 6:  return this.unpack_infix_expr(state);
    case 7:  return this.unpack_prefix_expr(state);
    case 8:  return this.unpack_postfix_expr(state);
    case 9:  return this.unpack_font_expr(state);
    case 10: return this.unpack_placeholder_expr(state);
    case 11: return this.unpack_function_call_expr(state);
    case 12: return this.unpack_array_expr(state);
    default: this.error("Unknown Expr typecode in MsgpackDecoder: " + typecode);
    }
  }
  unpack_text_expr([text]) {
    return new TextExpr(text);
  }
  unpack_command_expr([command_name, operand_expr_states, options]) {
    return new CommandExpr(
      command_name,
      operand_expr_states ?
        operand_expr_states.map(expr_state => this.unpack_expr(expr_state)) : null,
      options);
  }
  unpack_sequence_expr([expr_states]) {
    return new SequenceExpr(
      expr_states.map(expr_state => this.unpack_expr(expr_state)));
  }
  unpack_delimiter_expr([left_type, right_type, inner_expr_state, fixed_size]) {
    return new DelimiterExpr(
      left_type, right_type,
      this.unpack_expr(inner_expr_state),
      fixed_size);
  }
  unpack_subscriptsuperscript_expr([base_expr_state,
                                    subscript_expr_state, superscript_expr_state]) {
    return new SubscriptSuperscriptExpr(
      this.unpack_expr(base_expr_state),
      subscript_expr_state ? this.unpack_expr(subscript_expr_state) : null,
      superscript_expr_state ? this.unpack_expr(superscript_expr_state) : null);
  }
  unpack_infix_expr([operand_expr_states, operator_expr_states,
                     split_at_index, linebreaks_at]) {
    return new InfixExpr(
      operand_expr_states.map(expr_state => this.unpack_expr(expr_state)),
      operator_expr_states.map(expr_state => this.unpack_expr(expr_state)),
      split_at_index, linebreaks_at);
  }
  unpack_prefix_expr([base_expr_state, operator_expr_state]) {
    return new PrefixExpr(
      this.unpack_expr(base_expr_state),
      this.unpack_expr(operator_expr_state));
  }
  unpack_postfix_expr([base_expr_state, operator_expr_state]) {
    return new PostfixExpr(
      this.unpack_expr(base_expr_state),
      this.unpack_expr(operator_expr_state));
  }
  unpack_font_expr([expr_state, typeface, is_bold, size_adjustment]) {
    return new FontExpr(
      this.unpack_expr(expr_state),
      typeface, is_bold, size_adjustment);
  }
  unpack_placeholder_expr() {
    return new PlaceholderExpr();
  }
  unpack_function_call_expr([fn_expr_state, args_expr_state]) {
    return new FunctionCallExpr(
      this.unpack_expr(fn_expr_state),
      this.unpack_expr(args_expr_state));
  }
  unpack_array_expr([array_type, row_count, column_count,
                     element_expr_states,
                     row_separators, column_separators]) {
    return new ArrayExpr(
      array_type, row_count, column_count,
      element_expr_states.map(row_expr_states =>
        row_expr_states.map(expr_state => this.unpack_expr(expr_state))),
      row_separators, column_separators);
  }
}


export {
  Keymap, Settings, TextEntryState, LatexEmitter, AppState,
  UndoStack, FileManager,
  ExprPath, RationalizeToExpr, Item, ExprItem,
  TextItem, CodeItem, Stack, Document,
  MsgpackEncoder, MsgpackDecoder
};


