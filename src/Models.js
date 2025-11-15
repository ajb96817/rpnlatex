

import KeybindingTable from './Keymap';
import JSZip from 'jszip';
import {
  Expr, CommandExpr, FontExpr, PrefixExpr, InfixExpr, PlaceholderExpr,
  TextExpr, DelimiterExpr, SequenceExpr, SubscriptSuperscriptExpr /* , ArrayExpr */
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
  static load_from_local_storage() {
    const serialized_string = localStorage.getItem('settings');
    if(serialized_string)
      return Settings.from_json(JSON.parse(serialized_string));
    else
      return new Settings();
  }
  
  static from_json(json) {
    let s = new Settings();
    Settings.saved_keys().forEach(key => { s[key] = json[key]; });
    return s;
  }

  static saved_keys() {
    return [
      'debug_mode',
      'filter',
      'eink_mode',
      'last_opened_filename',
      'popup_mode',
      'layout',
      'show_mode_indicator',
      'hide_mouse_cursor',
      'autoparenthesize'
    ];
  }
  
  constructor() {
    this.current_keymap = new Keymap();
    this.debug_mode = false;
    this.filter = null;  // null, 'inverse_video', 'sepia'
    this.eink_mode = false;
    this.last_opened_filename = null;
    this.popup_mode = null;  // null, 'help', 'files'
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

  apply_layout_to_dom(stack_panel_elt, document_panel_elt, popup_panel_elt) {
    const layout = this.layout;

    // Show or hide popup panel.
    popup_panel_elt.style.display = this.popup_mode ? 'block' : 'none';

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

    // Set up panel layout.
    let [stack_bounds, document_bounds] = this._split_rectangle(
      {x: 0, y: 0, w: 100, h: 100},
      layout.stack_side,
      layout.stack_split);

    this._apply_bounds(stack_panel_elt, stack_bounds);
    this._apply_bounds(document_panel_elt, document_bounds);
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

  save() {
    const serialized_string = JSON.stringify(this.to_json());
    localStorage.setItem('settings', serialized_string);
  }

  to_json() {
    let json = {};
    Settings.saved_keys().forEach(key => { json[key] = this[key]; });
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
  static from_json(json) {
    return new AppState(
      Stack.from_json(json.stack),
      Document.from_json(json.document)
    );
  }
  
  constructor(stack, document) {
    this.stack = stack || this._default_stack();
    this.document = document || new Document();
    this.is_dirty = false;
  }

  _default_stack() {
    const item = TextItem.parse_string(
      "Welcome to the editor.  Type **[?]** to view the User Guide.");
    return new Stack([item]);
  }

  same_as(app_state) {
    // NOTE: AppState stuff is never modified in-place, so all that needs to be
    // done here is check object identities.
    return this.stack === app_state.stack && this.document === app_state.document;
  }

  to_json() {
    return {
      stack: this.stack.to_json(),
      document: this.document.to_json(),
      format: 1
    };
  }
}


class UndoStack {
  constructor() {
    // Stack of saved AppState instances (most recent one at the end).
    this.state_stack = [];

    // Maximum size of this.state_stack
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
      this.state_stack = this.state_stack.slice(0, this.state_stack.length - this.undo_count);
      this.undo_count = 0;
    }
    this.state_stack.push(state);
    // Prevent the undo list from growing indefinitely.
    if(this.state_stack.length > this.max_stack_depth)
      this.state_stack = this.state_stack.slice(this.state_stack.length - this.max_stack_depth);
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


// Interface to the browser's IndexedDB storage.
// https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
class DocumentStorage {
  constructor() {
    this.open_request = null;
    this.database = null;
  }

  open_database(onsuccess) {
    if(!indexedDB) return;
    this.on_open_success = onsuccess;
    this.open_request = indexedDB.open('rpnlatex', 1);
    this.open_request.onupgradeneeded = this.handle_upgrade_database.bind(this);
    this.open_request.onsuccess = this.handle_open_success.bind(this);
    this.open_request.onerror = this.handle_open_error.bind(this);
  }

  handle_upgrade_database(event) {
    this.database = this.open_request.result;
    switch(event.oldVersion) {
    case 0: this.build_initial_schema(); break;
    default: break;
    }
  }

  // 'documents' is a map of filename->json document content
  // 'documents_metadata' is a map of filename->filesize, etc.
  // The metadata is needed because otherwise the entire file contents have to be loaded and parsed
  // just to show the filesize and object count in the file selector.
  // IndexedDB indexes could probably be used for this instead (by having the index key be
  // "filename:filesize:object_counts:timestamp:etc").
  build_initial_schema() {
    this.database.createObjectStore('documents', {keyPath: 'filename'});
    this.database.createObjectStore('documents_metadata', {keyPath: 'filename'});
  }

  handle_open_error(event) {
    //alert("Unable to open IndexedDB for document storage.  You will be unable to save or load documents.\nThis may happen in Private Browsing mode on some browsers.\nError message: " + this.open_request.error);
    this.open_request = null;
  }

  handle_open_success(event) {
    this.database = this.open_request.result;
    this.open_request = null;
    this.database.onversionchange = () => {
      this.database.close();
      this.database = null;
      alert('Warning: database is outdated, please reload the page.');
    };
    if(this.on_open_success) this.on_open_success();
  }

  create_transaction(readwrite) {
    return this.database.transaction(
      ['documents', 'documents_metadata'],
      readwrite ? 'readwrite' : 'readonly');
  }

  sanitize_filename(filename) {
    const fn = filename.replaceAll(/[^a-zA-Z0-9_ ]/g, '').trim();
    return (fn.length === 0 || fn.length > 200) ? null : fn;
  }

  load_state(filename, onsuccess, onerror) {
    if(!this.database) return onerror();
    let transaction = this.create_transaction(false);
    let document_store = transaction.objectStore('documents');
    let request = document_store.get(filename);
    request.onsuccess = () => {
      // NOTE: request.result will be undefined if the filename key wasn't
      // found.  This still counts as a 'success'.
      const json = request.result;
      if(json) {
        const app_state = AppState.from_json(request.result);
        onsuccess(filename, app_state);
      }
      else
        onerror(filename, '???');  // TODO
    };
    request.onerror = () => {
      onerror(filename, '???');  // TODO
    };
  }

  save_state(app_state, filename, onsuccess, onerror) {
    if(!this.database) return onerror();
    let serialized_json = app_state.to_json();
    serialized_json.filename = filename;

    // Estimate the file size by serializing JSON.
    // IndexedDB also does this serialization itself, but there doesn't
    // seem to be any way to reuse that result directly.
    const filesize = JSON.stringify(serialized_json).length;
    const metadata_json = {
      filename: filename,
      filesize: filesize,
      description: '',  // TODO
      stack_item_count: app_state.stack.depth(),
      document_item_count: app_state.document.items.length,
      timestamp: new Date()
    };
    let transaction = this.create_transaction(true);
    transaction.objectStore('documents').put(serialized_json);
    transaction.objectStore('documents_metadata').put(metadata_json);
    if(onsuccess) transaction.oncomplete = onsuccess;
    if(onerror) transaction.onabort = onerror;
  }

  delete_state(filename, onsuccess, onerror) {
    if(!this.database) return onerror();
    let transaction = this.create_transaction(true);
    transaction.objectStore('documents').delete(filename);
    transaction.objectStore('documents_metadata').delete(filename);
    if(onsuccess) transaction.oncomplete = onsuccess;
    if(onerror) transaction.onabort = onerror;
  }

  fetch_file_list(onsuccess, onerror) {
    if(!this.database) return onerror();
    let transaction = this.create_transaction(false);
    let request = transaction.objectStore('documents_metadata').getAll();
    request.onsuccess = () => {
      request.result.forEach(row => {
        const ts_value = Date.parse(row.timestamp);
        row.timestamp = ts_value ? new Date(ts_value) : null;
      });
      onsuccess(request.result);
    };
    request.onerror = onerror;
  }

  // Fetch all documents using a cursor.  'onrowfetched' is invoked once per document
  // and then 'onfinished' is invoked at the end.
  fetch_all_documents(onrowfetched, onfinished, onerror) {
    if(!this.database) return onerror();
    let transaction = this.create_transaction(false);
    let cursor = transaction.objectStore('documents').openCursor();
    cursor.onsuccess = (event) => {
      const c = event.target.result;
      if(c) {
        onrowfetched(c.value);
        c.continue();
      }
      else
        onfinished();
    };
    cursor.onerror = onerror;
  }
}


// Manage state of importing/exporting zip archives.
class ImportExportState {
  constructor() {
    // States:
    //   'idle' - if this.download_url is populated, an export download is ready
    //   'error' - export failed, this.error_message is populated
    //   'loading' - in the process of loading from the database cursor
    //   'zipping' - creation of zip file in progress
    //   'uploading' - user is uploading an archive zipfile
    //   'importing' - uploaded zipfile is being processed/imported
    this.state = 'idle';

    this.document_storage = null;  // will be initialized by AppState

    // Number of imported documents handled so far.
    this.import_count = 0;

    // Number of failures noted this import (if >0, this.error_message will also be set).
    this.failed_count = 0;
    this.error_message = null;

    // Holds the last-generated blob download URL, if any.
    this.download_url = null;

    // This will be set on a successful import.
    this.import_result_string = null;

    // This will be set to true if the main file list (FileManagerState) needs to be refreshed from the DB.
    this.file_list_needs_update = false;

    // This can be set to a function to monitor state changes.
    this.onstatechange = null;
  }

  // TODO: -> state_description()
  textual_state() {
    switch(this.state) {
    case 'idle': return this.download_url ? 'Download ready' : 'Ready for export or import';
    case 'error': return 'Error: ' + this.error_message;
    case 'loading': return 'Extacting database...';
    case 'zipping': return 'Compressing files...';
    case 'uploading': return 'Uploading data...';
    case 'importing': return 'Importing documents: ' + this.import_count + ' so far';
    default: return '???';
    }
  }

  download_available() {
    return this.state === 'idle' && this.download_url;
  }

  generate_download_filename() {
    const date = new Date();
    return [
      'rpnlatex_', date.getFullYear().toString(), '_',
      date.toLocaleString('default', {month: 'short'}).toLowerCase(),
      '_', date.getDate().toString().padStart(2, '0'), '.zip'
    ].join('');
  }

  change_state(new_state) {
    this.state = new_state;
    if(this.onstatechange)
      this.onstatechange(this);
  }
  
  start_exporting() {
    let document_storage = this.document_storage;
    this.zip = new JSZip();
    document_storage.fetch_all_documents(
      (row) => this.add_document_json_to_zip(row),
      () => this.start_compressing(),
      () => {
        this.error_message = 'Unable to export the document database.';
        this.change_state('error');
      });
    this.change_state('loading');
  }

  add_document_json_to_zip(json) {
    this.zip.file(json.filename + '.json', JSON.stringify(json));
  }

  start_compressing() {
    this.change_state('zipping');
    this.zip.generateAsync({type: 'blob'}).then(content_blob => {
      this.finished_compressing(content_blob);
    });
  }

  clear_download_url() {
    if(this.download_url) {
      URL.revokeObjectURL(this.download_url);
      this.download_url = null;
    }
  }

  finished_compressing(content_blob) {
    this.clear_download_url();
    this.download_url = URL.createObjectURL(content_blob);
    this.zip = null;
    this.change_state('idle');
  }

  // zipfile is a File object from a <input type="file"> element.
  start_importing(zipfile) {
    this.clear_download_url();
    this.import_result_string = null;
    if(zipfile.type !== 'application/zip') {
      alert('Import files must be zip archives.');
      return;
    }
    this.change_state('uploading');
    let reader = new FileReader();
    reader.addEventListener(
      'load',
      event => this.process_uploaded_data(event.target.result));
    reader.readAsArrayBuffer(zipfile);
  }

  process_uploaded_data(data) {
    this.import_count = 0;
    this.failed_count = 0;
    this.error_message = null;
    this.change_state('importing');
    JSZip.loadAsync(data).then(zipfile => {
      let promises = [];
      for(let filename in zipfile.files) {
        const file = zipfile.files[filename];
        if(filename.endsWith('.json')) {
          promises.push(
            file.async('string').then(
              content => this.import_file(file.name.slice(0, file.name.length-5), content)));
        }
        else {
          this.error_message = 'Invalid filename in archive: ' + filename;
          this.failed_count++;
        }
      }
      Promise.all(promises).then(
        () => {
          if(this.failed_count > 0)
            this.import_result_string = 'Errors encountered: ' + this.error_message;
          else
            this.import_result_string = 'Successfully imported ' + this.import_count + ' document' + (this.import_count === 1 ? '' : 's');
          this.change_state('idle');
          this.file_list_needs_update = true;
        });
    });
  }

  import_file(filename, content) {
    let document_storage = this.document_storage;
    let parsed, app_state;
    try {
      parsed = JSON.parse(content);
      app_state = AppState.from_json(parsed);
    } catch(e) {
      this.error_message = 'Invalid document found in zip file: ' + filename;
      this.failed_count++;
      return;
    }
    document_storage.save_state(app_state, filename);
    this.import_count++;
    this.change_state('importing');
  }

  import_json_file(filename, content) {
    let document_storage = this.document_storage;
    let parsed, app_state;
    try {
      parsed = JSON.parse(content);
      app_state = AppState.from_json(parsed);
    } catch(e) {
      alert('Invalid .json file: ' + filename);
      return;
    }
    document_storage.save_state(app_state, filename);
  }
}


class FileManagerState {
  constructor(file_list, selected_filename, current_filename) {
    this.file_list = file_list;
    this.selected_filename = selected_filename;
    this.current_filename = current_filename;
    this.unavailable = false;  // set to true if there's a database error
  }

  sort_file_list(field, ascending) {
    this.file_list.sort((a, b) => {
      const a_value = a[field], b_value = b[field];
      return (ascending ? 1 : -1)*(a_value === b_value ? 0 : (a_value < b_value ? -1 : 1));
    });
  }

  // basename -> basename_1
  // basename_1 -> basename_2
  // The first available name is used, so basename_50 -> basename_2
  // if basename_2 is available but basename_1 is taken.
  generate_unused_filename(basename) {
    if(this.unavailable || !this.file_list)
      return basename;
    basename = basename.replace(/_\d+$/, '')
    for(let n = 1; n < 1000; n++) {
      const candidate = basename + '_' + n;
      if(!this.file_list.some(file => file.filename === candidate))
        return candidate;
    }
    return basename + '_toomany';
  }

  // For moving up or down in the list of files.
  find_adjacent_filename(filename, offset) {
    if(this.unavailable || !this.file_list) return null;
    let new_filename = null;
    let file_list = this.file_list;
    file_list.forEach((f, index) => {
      if(f.filename === filename) {
        let new_index = index+offset;
        if(new_index < 0) new_index = 0;
        if(new_index >= file_list.length) new_index = file_list.length-1;
        new_filename = file_list[new_index].filename;
      }
    });
    if(!new_filename && file_list.length > 0)
      new_filename = file_list[0].filename;
    return new_filename;
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
    if(this.expr !== other_path.expr)
      return false;
    if(this.subexpr_indexes.length !== other_path.subexpr_indexes.length)
      return false;
    for(let i = 0; i < this.subexpr_indexes.length; i++)
      if(this.subexpr_indexes[i] !== other_path.subexpr_indexes[i])
        return false;
    return true;
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


// Parse simple "algebraic" snippets, for use in math_entry mode.
//
// NOTE: This has been superseded by Algebrite's expression parser,
// but may want to come back to this eventually.
//
// Rules:
//   - Spaces are ignored except to separate numbers.
//   - "Symbols" are one-letter substrings like 'x'.
//   - As a special case, '@' becomes \pi.
//   - Adjacent factors are combined with implicit multiplication.
//     'xyz' is considered implicit multiplication of x,y,z.
//   - '*' is multiplication, but gets converted to \cdot.
//   - '/' and '*' bind tighter than '+' and '-'.
//   - Delimiters can be used, but must match properly; e.g. 10[x+(y-3)]
//   - Postfix factorial and "prime" (y'') notation is allowed.
//   - Scientific notation such as 3e-4 is handled as a special case.
//   - Placeholders can be inserted with [].
//   - Negative constants such as -10 are handled by the "- factor" production
//     below; that is the reason for the allow_unary_minus flag being passed
//     around.  The implicit multiplication rule would otherwise make things
//     like '2-3' be parsed as '2*(-3)'.
//
// Mini-grammar:
//   expr:
//       term |
//       term '+' expr
//       term '-' expr(!allow_unary_minus)
//   term:
//       factor |
//       factor '*','/' term(allow_unary_minus)
//       factor term      (implicit multiplication)
//   factor:
//       number |
//       symbol |
//       pi |             (special case '@' syntax)
//       '(' expr ')' |   (delimiter types must match)
//       '-' factor |     (unary minus, only if factor(allow_unary_minus))
//       factor '!' |     (factorial notation)
//       factor "'" |     (prime notation)
//       
//       []               (placeholder)
//
class ExprParser {
  static parse_string(string) {
    const tokens = this.tokenize(string);
    if(!tokens) return null;
    let parser = new ExprParser(tokens);
    let expr = null;
    try {
      expr = parser.parse_expr(true);
    } catch(e) {
      if(e.message === 'parse_error')
        ;  // leave expr as null
      else
        throw e;
    }
    if(!expr) return null;
    if(!parser.at_end()) return null;  // extraneous tokens at end
    return expr;
  }

  // "Parse" a roman_text string (via Shift+Enter from [\] math entry mode).
  // This just wraps the string in a roman typeface FontExpr; but if
  // the string contains [] sequences, those are converted into placeholders
  // and the resulting Expr is a SequenceExpr with a mixture of FontExprs
  // (for the text pieces) and PlaceholderExprs.
  static roman_text_to_expr(string) {
    const pieces = string.split('[]');
    let exprs = [];
    for(let i = 0; i < pieces.length; i++) {
      if(pieces[i].length > 0)
        exprs.push(FontExpr.roman_text(pieces[i]));
      if(i < pieces.length-1)
        exprs.push(new PlaceholderExpr());
    }
    if(exprs.length === 0)
      return FontExpr.roman_text('');  // special case: 'string' is empty
    else if(exprs.length === 1)
      return exprs[0];
    else
      return new SequenceExpr(exprs);
  }
  
  // Break string into tokens; token types are:
  //   number: 3, 3.1, etc.
  //     NOTE: negative numbers are handled by the "- factor" production in the grammar
  //   symbol: x (xyz becomes 3 separate symbols)
  //   pi: @ -> \pi (special case)
  //   operator: +, -, *, /, //, !, '
  //   open_delimiter: ( or [ or {
  //   close_delimiter: ) or ] or }
  static tokenize(s) {
    let pos = 0;
    let tokens = [];
    let number_regex = /\d*\.?\d+/g;
    while(pos < s.length) {
      // Check for number:
      number_regex.lastIndex = pos;
      const result = number_regex.exec(s);
      if(result && result.index === pos) {
        tokens.push({type: 'number', text: result[0], pos: pos});
        pos += result[0].length;
      }
      // Check for [] placeholder:
      else if(pos < s.length-1 && s[pos] === '[' && s[pos+1] === ']') {
        tokens.push({type: 'placeholder', text: '[]', pos: pos});
        pos += 2;
      }
      // Check for // (full size fraction):
      else if(pos < s.length-1 && s[pos] === '/' && s[pos+1] === '/') {
        tokens.push({type: 'operator', text: '//', pos: pos});
        pos += 2;
      }
      else {
        // All other tokens are always 1 character.
        const token = s[pos];
        let token_type = null;
        if(/\s/.test(token)) token_type = 'whitespace';
        else if(/\w/.test(token)) token_type = 'symbol';
        else if(/[-+!'/*]/.test(token)) token_type = 'operator';
        else if(/[([{]/.test(token)) token_type = 'open_delimiter';
        else if(/[)\]}]/.test(token)) token_type = 'close_delimiter';
        else if(token === '@') token_type = 'pi';
        if(token_type === null)
          return null;  // invalid token found (something like ^, or unicode)
        if(token_type !== 'whitespace')  // skip whitespace
          tokens.push({type: token_type, text: token, pos: pos});
        pos++;
      }
    }
    return tokens;
  }

  constructor(tokens) {
    this.tokens = tokens;
    this.token_index = 0;
  }

  parse_expr(allow_unary_minus) {
    const lhs = this.parse_term(allow_unary_minus) || this.parse_error();
    let result_expr = lhs;
    const binary_token = this.peek_for('operator');
    if(binary_token &&
       (binary_token.text === '+' || binary_token.text === '-')) {
      this.next_token();
      const allow_unary_minus = binary_token.text === '+';
      const rhs = this.parse_expr(allow_unary_minus) || this.parse_error();
      // Special case: check for scientific notation with a negative exponent.
      // 4e-3 is initially parsed as (4e)-(3); convert this specific case
      // into scientific notation.
      // Nonnegative exponents are instead parsed as 4e3 -> 4 (e3) and
      // are handled in parse_term.
      if(lhs.is_sequence_expr() && lhs.exprs.length === 2 &&
         lhs.exprs[0].is_text_expr_with_number() &&
         lhs.exprs[1].is_text_expr() &&
         ['e', 'E'].includes(lhs.exprs[1].text) &&
         rhs.is_text_expr_with_number()) {
        // NOTE: 3e+4 (explicit +) is allowed here for completeness.
        const exponent_text = binary_token.text === '-' ? ('-' + rhs.text) : rhs.text;
        result_expr = InfixExpr.combine_infix(
          lhs.exprs[0],
          TextExpr.integer(10).with_superscript(exponent_text),
          new CommandExpr('cdot'));
      }
      else result_expr = InfixExpr.combine_infix(
        lhs, rhs, Expr.text_or_command(binary_token.text));
    }
    return result_expr;
  }

  parse_term(allow_unary_minus) {
    const lhs = this.parse_factor(allow_unary_minus);
    if(!lhs) return null;
    const op_token = this.peek_for('operator');
    if(op_token && (op_token.text === '*' || op_token.text === '/')) {
      // Explicit multiplication converts to \cdot
      const op_text = (op_token.text === '*' ? "\\cdot" : '/');
      this.next_token();
      const rhs = this.parse_term(true) || this.parse_error();
      return InfixExpr.combine_infix(
        lhs, rhs, Expr.text_or_command(op_text));
    }
    if(op_token && op_token.text === '//') {
      // Full-size fraction.
      this.next_token();
      const rhs = this.parse_term(true) || this.parse_error();
      return new CommandExpr('frac', [lhs, rhs]);
    }
    // Try implicit multiplication: 'factor term' production.
    const rhs = this.parse_term(false);  // NOTE: not an error if null
    if(rhs) {
      // Combining rules for implicit multiplication:
      //   number1 number2      -> number1 \cdot number2
      //   number1 a \cdot b    -> number1 \cdot a \cdot b
      //   number1 E|e number2  -> number1 \cdot 10^number2 (scientific notation)
      // Any other pair just concatenates.
      const cdot = Expr.text_or_command("\\cdot");
      if(lhs.is_text_expr_with_number() &&
         rhs.is_text_expr_with_number())
        return InfixExpr.combine_infix(lhs, rhs, cdot);
      else if(rhs.is_infix_expr() &&
              rhs.operator_exprs.every(expr => rhs.operator_text(expr) === 'cdot'))
        return InfixExpr.combine_infix(lhs, rhs, cdot);
      else if(rhs.is_sequence_expr() &&
              rhs.exprs.length === 2 &&
              rhs.exprs[1].is_text_expr_with_number() &&
              rhs.exprs[0].is_text_expr() &&
              ['e', 'E'].includes(rhs.exprs[0].text) &&
              lhs.is_text_expr_with_number()) {
        // Scientific notation with nonnegative exponent (e.g. prepending a number to "e4").
        // Negative exponents are handled in parse_expr instead.
        return InfixExpr.combine_infix(
          lhs,
          TextExpr.integer(10).with_superscript(rhs.exprs[1]),
          new CommandExpr('cdot'));
      }
      else
        return Expr.combine_pair(lhs, rhs, true /* no_parenthesize */);
    }
    else
      return lhs;  // factor by itself
  }

  parse_factor(allow_unary_minus) {
    let factor = this.parse_factor_(allow_unary_minus);
    while(factor) {
      // Process one or more postfix ! or ' (prime) tokens if present.
      const op_token = this.peek_for('operator');
      if(op_token && op_token.text === '!') {
        this.next_token();
        factor = Expr.combine_pair(factor, new TextExpr('!'));
      }
      else if(op_token && op_token.text === '\'') {
        this.next_token();
        factor = factor.with_prime(true);
      }
      else break;
    }
    return factor;
  }

  parse_factor_(allow_unary_minus) {
    let expr = null;
    if(allow_unary_minus) {
      // NOTE: double unary minus not allowed (--3).
      const negate_token = this.peek_for('operator');
      if(negate_token && negate_token.text === '-') {
        this.next_token();
        expr = this.parse_factor_(false);
        if(expr) return PrefixExpr.unary_minus(expr);
        else return null;
      }
    }
    if(this.peek_for('number'))
      return TextExpr.integer(this.next_token().text);
    else if(this.peek_for('symbol'))
      return new TextExpr(this.next_token().text);
    else if(this.peek_for('pi')) {
      this.next_token();
      return new CommandExpr('pi');
    }
    else if(this.peek_for('placeholder')) {
      this.next_token();
      return new PlaceholderExpr();
    }
    else if(this.peek_for('open_delimiter')) {
      const open_delim_type = this.next_token().text;
      const inner_expr = this.parse_expr(true) || this.parse_error();
      if(!this.peek_for('close_delimiter'))
        return this.parse_error();
      const close_delim_type = this.next_token().text;
      if(this.matching_closing_delimiter(open_delim_type) !== close_delim_type)
        return this.parse_error();  // mismatched delimiters
      let [left, right] = [open_delim_type, close_delim_type];
      if(open_delim_type === '{')
        [left, right] = ["\\{", "\\}"];  // latex-compatible form
      return new DelimiterExpr(left, right, inner_expr);
    }
    else
      return null;
  }

  matching_closing_delimiter(open_delim) {
    if(open_delim === '(') return ')';
    else if(open_delim === '[') return ']';
    else if(open_delim === '{') return '}';
    else return null;
  }

  peek_for(token_type) {
    if(this.at_end())
      return null;
    if(this.tokens[this.token_index].type === token_type)
      return this.tokens[this.token_index];
    else
      return null;
  }
  
  next_token() {
    if(this.at_end())
      return this.parse_error();
    else {
      this.token_index++;
      return this.tokens[this.token_index-1];
    }
  }

  at_end() {
    return this.token_index >= this.tokens.length;
  }

  parse_error() { throw new Error('parse_error'); }
}


// Conversion of any floating-point values in an Expr to (approximate)
// rational fractions or rational multiples of common numbers like sqrt(2).
class RationalizeToExpr {
  static rationalize_expr(expr, full_size_fraction=true) {
    return new RationalizeToExpr(
      full_size_fraction).rationalize_expr(expr);
  }
  
  static rationalize(value, full_size_fraction=true) {
    return new RationalizeToExpr(
      full_size_fraction).value_to_expr(value);
  }

  constructor(full_size_fraction) {
    this.full_size_fraction = full_size_fraction;
  }
  
  rationalize_expr(expr) {
    const rationalized_expr = this._try_rationalize_real_expr(expr);
    if(rationalized_expr)
      return rationalized_expr;
    else {
      // Check subexpressions recursively.
      const subexpressions = expr.subexpressions();
      for(let i = 0; i < subexpressions.length; i++)
        expr = expr.replace_subexpression(
          i, this.rationalize_expr(subexpressions[i]));
      return expr;
    }
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
        if(negated)
          value *= 1.0;
        return this.value_to_expr(value);
      }
    }
    return null;
  }
  
  // Try to find a close rational approximation to a floating-point
  // value, or up to a factor of some common constants like sqrt(2) or pi.
  // Return an Expr if successful, otherwise null.
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
    // (335/113) both has small denominator and is very close to the actual
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
    // Check factors of ln(2)
    result ||= this._try_rationalize_with_factor(
      value, Math.log(2), new CommandExpr('ln', [this._int_to_expr(2)]), null);
    // Try sqrt(n) in the numerator for small square-free n.
    // No need to check denominators since, e.g. 1/sqrt(3) = sqrt(3)/3
    const small_squarefree = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19];
    for(let i = 0; i < small_squarefree.length; i++)
      result ||= this._try_rationalize_with_factor(
        value, Math.sqrt(small_squarefree[i]),
        make_sqrt(this._int_to_expr(small_squarefree[i])), null);
    // Try golden ratio-like factors
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
    // Finally, rationalize the number itself with no factors
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
        let frac_expr = CommandExpr.frac(numer_expr, denom_expr);
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
    let [a, b, c, d] = [0, 1, 1, 1];
    while(b <= max_denom && d <= max_denom) {
      const mediant = (a+c) / (b+d);
      if(x === mediant) {
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


// class SpecialFunctions {
//   static factorial(x) {
//     if(x >= 0 && this.is_integer(x)) {
//       if(x <= 1) return 1;
//       if(x > 20) return Infinity;
//       let value = 1;
//       for(let i = 2; i <= x; i++)
//         value *= i;
//       return value;
//     }
//     else
//       return this.gamma(x+1);
//   }

//   static gamma(x) {
//     const g = 7;
//     const C = [
//       0.99999999999980993, 676.5203681218851, -1259.1392167224028,
//       771.32342877765313, -176.61502916214059, 12.507343278686905,
//       -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
//     if(x <= 0)
//       return NaN;
//     if(x < 0.5)
//       return Math.PI / (Math.sin(Math.PI*x) * this.gamma(1-x));
//     x -= 1;
//     let y = C[0];
//     for(let i = 1; i < g+2; i++)
//       y += C[i] / (x + i);
//     const t = x + g + 0.5;
//     const result = Math.sqrt(2*Math.PI) * Math.pow(t, x+0.5) * Math.exp(-t) * y;
//     return isNaN(result) ? Infinity : result;
//   }

//   // Basic iterative evaluation of double factorial.
//   // 7!! = 7*5*3*1, 8!! = 8*6*4*2, 0!! = 1
//   // x must be a nonnegative integer and its magnitude is limited to something reasonable
//   // to avoid long loops or overflow.
//   static double_factorial(x) {
//     if(!this.is_integer(x) || x < 0) return NaN;
//     if(x > 100) return Infinity;
//     let result = 1;
//     while(x > 1) {
//       result *= x;
//       x -= 2;
//     }
//     return result;
//   }

//   static is_integer(x) {
//     return x === Math.floor(x);
//   }

//   static binom(n, k) {
//     // k must be a nonnegative integer, but n can be anything
//     if(!this.is_integer(k) || k < 0) return null;
//     if(k > 1000) return NaN;  // Limit loop length below
//     // Use falling factorial-based algorithm n_(k) / k!
//     let value = 1;
//     for(let i = 1; i <= k; i++)
//       value *= (n + 1 - i) / i;
//     if(this.is_integer(n)) {
//       // Resulting quotient is an integer mathematically if n is,
//       // but round it because of the limited floating point precision.
//       return Math.round(value);
//     }
//     else
//       return value;
//   }
// }


// Represents an entry in the stack or document.
class Item {
  // Used for React collection keys.  Each entry in a React component list is
  // supposed to have a unique ID.
  // NOTE: iOS Safari doesn't seem to like static variables like this?
  // As a workaround, this will be initialized after the class definition instead.
  //static serial_number = 1;
  static next_serial() { return Item.serial_number++; }

  static from_json(json) {
    switch(json.item_type) {
    case 'expr':
      return new ExprItem(
        Expr.from_json(json.expr),
        json.tag_string || null,
        json.source_string || null);
    case 'text':
      return new TextItem(
        json.elements.map(element_json => TextItemElement.from_json(element_json)),
        json.tag_string || null,
        json.source_string || null,
        !!json.is_heading);
    case 'code':
      return new CodeItem(json.language, json.source);
    default:
      return TextItem.from_string('invalid item type ' + json.item_type);
    }
  }

  // 'tag_string' is an optional tag shown to the right of the item.
  // 'source_string' is the original "source code" string for items
  // that were created in the minieditor.
  constructor(tag_string, source_string) {
    this.serial = Item.next_serial();
    this.tag_string = tag_string;
    this.source_string = source_string;
  }

  react_key(prefix) { return prefix + '_' + this.serial; }

  // Subclasses need to override these:
  item_type() { return '???'; }
  to_json() { return {}; }

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
  
  to_json() {
    let json = {item_type: 'expr', expr: this.expr.to_json()};
    if(this.tag_string) json.tag_string = this.tag_string;
    if(this.source_string) json.source_string = this.source_string;
    return json;
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
  static from_json(json) {
    if(json.expr)
      return new TextItemExprElement(Expr.from_json(json.expr));
    else if(json.text)
      return new TextItemTextElement(json.text, !!json.is_bold, !!json.is_italic);
    else
      return new TextItemRawElement(json.raw);
  }

  is_text() { return false; }
  is_expr() { return false; }
  is_raw() { return false; }
}


class TextItemTextElement extends TextItemElement {
  // Bold/italic fonts are handled specially for text items.
  // Bold and italic words are put inside \textbf{} and \textit{} commands
  // instead of \text{}.  Currently bold and italic at once is not supported.
  constructor(text, is_bold, is_italic) {
    super();
    this.text = text;
    this.is_bold = !!is_bold;
    this.is_italic = !!is_italic;
  }

  is_text() { return true; }
  as_bold() { return new TextItemTextElement(this.text, true); }

  to_json() {
    let json = {'text': this.text};
    if(this.is_bold) json.is_bold = true;
    if(this.is_italic) json.is_italic = true;
    return json;
  }

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
  to_json() { return {'expr': this.expr.to_json()}; }

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
  to_json() { return {'raw': this.string}; }
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
  //            as parsed by ExprParser (limited functionality).
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
            //let math_expr = ExprParser.parse_string(math_text);
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

  to_json() {
    let json = {
      item_type: 'text',
      elements: this.elements.map(element => element.to_json())
    };
    // Avoid lots of useless is_heading:false / tag_string:null in the JSON.
    if(this.is_heading) json.is_heading = true;
    if(this.tag_string) json.tag_string = this.tag_string;
    if(this.source_string) json.source_string = this.source_string;
    return json;
  }

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

  to_json() {
    return {
      item_type: 'code',
      language: this.language,
      source: this.source
    };
  }

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
  static from_json(json) {
    return new Stack(
      json.items.map(item_json => Item.from_json(item_json)),
      json.floating_item ? Item.from_json(json.floating_item) : null);
  }

  // NOTE: floating_item is a temporary holding slot to keep an item off to
  // the side, as a user convenience.
  constructor(items, floating_item) {
    this.items = items;
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
  peek(n=1) {
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
  pop_exprs(n=1) {
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

  to_json() {
    return {
      object_type: 'stack',
      items: this.items.map(item => item.to_json()),
      floating_item: this.floating_item ? this.floating_item.to_json() : null
    };
  }
}


// The document item list.  Like Stack, all Document operations are non-destructive
// and return a new Document reflecting the changes.
class Document {
  static from_json(json) {
    return new Document(
      json.items.map(item_json => Item.from_json(item_json)),
      json.selection_index || 0);
  }

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

  to_json() {
    return {
      object_type: 'document',
      items: this.items.map(item => item.to_json()),
      selection_index: this.selection_index
    };
  }
}


export {
  Keymap, Settings, TextEntryState, LatexEmitter, AppState,
  UndoStack, DocumentStorage, ImportExportState, FileManagerState,
  ExprPath, ExprParser, RationalizeToExpr, Item, ExprItem,
  TextItem, CodeItem, Stack, Document
};

