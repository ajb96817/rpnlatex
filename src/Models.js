

import KeybindingTable from './Keymap';
import JSZip from 'jszip';


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
        if(mode_map['default']) return mode_map['default'];
        if(mode === 'base' || mode === 'editor')
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
        Settings.saved_keys.forEach(key => { s[key] = json[key]; });
        return s;
    }
    
    constructor() {
        this.current_keymap = new Keymap();
        this.selected_theme = 'default';
        this.last_opened_filename = null;
        this.popup_mode = null;  // null, 'help', 'files', 'keymap'
        this.layout = this.default_layout();
    }

    default_layout() {
        return {
            zoom_factor: 0,
            stack_rightalign_math: false,
            document_rightalign_math: false,
            inline_math: false,
            stack_side: 'left',
            stack_split: 50
        };
    }

    apply_layout_to_dom(stack_panel_elt, document_panel_elt, popup_panel_elt) {
        const layout = this.layout;

        // Show or hide popup panel.
        popup_panel_elt.style.display = this.popup_mode ? 'block' : 'none';

        // Set overall scale factor.
        const root_elt = document.getElementById('root');
        const percentage = Math.round(100*Math.pow(1.05, layout.zoom_factor || 0));
        root_elt.style.fontSize = percentage + '%';

        // Set up panel layout.
        let [stack_bounds, document_bounds] = this._split_rectangle(
            {x: 0, y: 0, w: 100, h: 100}, layout.stack_side, layout.stack_split);

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
        Settings.saved_keys.forEach(key => { json[key] = this[key]; });
        return json;
    }
}

Settings.saved_keys = [
    'selected_theme', 'last_opened_filename', 'popup_mode', 'layout'
];


// Helper for generating LaTeX strings from Expr objects.
class LatexEmitter {
    constructor() {
        this.tokens = [];
        this.last_token_type = null;
    }

    emit_token(text, token_type) {
        if(text.length > 0) {
            this.tokens.push(text);
            this.last_token_type = token_type;
        }
    }

    expr(expr) { expr.emit_latex(this); }

    grouped_expr(expr, force_braces) { this.grouped((() => this.expr(expr)), force_braces); }

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
    text(text) {
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
            command_name = command_name + '[' + command_options + ']';
        this.emit_token("\\" + command_name, 'command');
    }

    // Treated like text or a command depending on whether it starts with a backslash.
    text_or_command(text) {
        if(text.startsWith("\\"))
            this.command(text.slice(1));
        else
            this.text(text);
    }

    begin_environment(envname) { this.text("\\begin{" + envname + "}\n"); }

    end_environment(envname) { this.text("\n\\end{" + envname + "}\n"); }

    align_separator() { this.text(' & '); }

    // Table row separators for e.g. \begin{matrix}
    row_separator() {
        // Give a little more space between rows, for fractions.
        // See KaTeX "common issues" page.
        this.text("\\\\[0.1em]\n");
        //this.text("\\\\\n");
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
        this.document = document || new Document([], 0);
        this.is_dirty = false;
    }

    _default_stack() {
        const item = TextItem.from_string('Welcome to the editor.  Press [?] to toggle help.');
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
        else return null;
    }

    redo_state() {
        if(this.undo_count > 0) {
            this.undo_count--;
            return this.state_stack[this.state_stack.length - this.undo_count - 1];
        }
        else return null;
    }
}


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
        this.database.onversionchange = function () {
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
                // Parse the timestamp
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
        case 'idle': return this.download_url ? 'Download Ready' : 'Ready for export or import';
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


// Abstract superclass for expression trees.
class Expr {
    static from_json(json) {
        switch(json.expr_type) {
        case 'command':
            return new CommandExpr(json.command_name, this._list(json.operand_exprs), json.options);
        case 'prefix':
            return new PrefixExpr(this._expr(json.base_expr), this._expr(json.prefix_expr));
        case 'infix':
            return new InfixExpr(this._expr(json.operator_expr), this._expr(json.left_expr),
                                 this._expr(json.right_expr), json.split || null);
        case 'defer':
            return new DeferExpr();
        case 'text':
            return new TextExpr(json.text);
        case 'sequence':
            return new SequenceExpr(this._list(json.exprs));
        case 'delimiter':
            return new DelimiterExpr(json.left_type, json.right_type, json.middle_type, this._list(json.inner_exprs));
        case 'subscriptsuperscript':
            return new SubscriptSuperscriptExpr(this._expr(json.base_expr), this._expr(json.subscript_expr), this._expr(json.superscript_expr));
        case 'array':
            return new ArrayExpr(json.array_type, json.row_count, json.column_count, this._list2d(json.element_exprs));
        default:
            return new TextExpr('invalid expr type ' + json.expr_type);
        }
    }

    // Helper routines for from_json
    static _expr(json) { return json ? Expr.from_json(json) : null; }
    static _list(json_array) { return json_array.map(expr_json => Expr.from_json(expr_json)); }
    static _list2d(json_array) { return json_array.map(row_exprs => Expr._list(row_exprs)); }
    
    // Concatenate two Exprs into one.  This will merge Sequence and Text
    // nodes when possible, instead of creating nested SequenceExprs.
    static combine_pair(left, right) {
        const left_type = left.expr_type(), right_type = right.expr_type();
        if(left_type === 'sequence' && right_type === 'sequence')
            return new SequenceExpr(left.exprs.concat(right.exprs));
        else if(left_type === 'text' && right_type === 'text')
            return new TextExpr(left.text + right.text);
        else if(left_type === 'sequence' && right_type === 'text' &&
                left.exprs[left.exprs.length-1].expr_type() === 'text') {
            // Left sequence ends in a Text; merge it with the new Text.
            return new SequenceExpr(
                left.exprs.slice(0, -1).concat([
                    new TextExpr(left.exprs[left.exprs.length-1].text + right.text)
                ]));
        }
        else if(left_type === 'text' && right_type === 'text' &&
                right.exprs[0].expr_type() === 'text') {
            // Right sequence starts with a Text; merge it with the new Text.
            return new SequenceExpr(
                [new TextExpr(left.text + right.exprs[0].text)
                ].concat(right.exprs.slice(1)));
        }
        else if(left_type === 'command' && right_type === 'command')
            return Expr.combine_command_pair(left, right);
        else
            return new SequenceExpr([left, right]);
    }

    // Combine two CommandExprs with some special-casing for particular
    // command pairs (combining integral symbols currently).
    static combine_command_pair(left, right) {
        const left_name = left.command_name, right_name = right.command_name;
        let new_command_name = null;
        if(left_name === 'int' && right_name === 'int') new_command_name = 'iint';
        if(left_name === 'iint' && right_name === 'int') new_command_name = 'iiint';
        if(left_name === 'int' && right_name === 'iint') new_command_name = 'iiint';
        if(left_name === 'oint' && right_name === 'oint') new_command_name = 'oiint';
        if(left_name === 'oiint' && right_name === 'oint') new_command_name = 'oiiint';
        if(left_name === 'oint' && right_name === 'oiint') new_command_name = 'oiiint';
        if(new_command_name)
            return new CommandExpr(new_command_name);
        else
            return new SequenceExpr([left, right]);
    }
    
    expr_type() { return '???'; }

    to_latex() {
        let emitter = new LatexEmitter();
        this.emit_latex(emitter);
        return emitter.finished_string();
    }

    emit_latex(emitter) { emitter.text('INVALID'); }

    // Return a list of property names on this object that should be serialized
    json_keys() { return []; }

    // Subclasses can extend this if they need special handling.
    to_json() {
        let json = { expr_type: this.expr_type() };
        this.json_keys().forEach(json_key => {
            const obj = this[json_key];
            let value;
            if(obj === null || obj === undefined)
                value = null;
            else if(typeof(obj) === 'object' && obj instanceof Expr)
                value = obj.to_json();
            else if(typeof(obj) === 'object') {
                // Assume it's an Array.  It could also be a 2-dimensional array, in which case the subclasses
                // need to extend to_json() instead of relying on this default.
                value = obj.map(elt => elt.to_json());
            }
            else // Strings, numbers, etc.
                value = obj;
            json[json_key] = value;
        });
        return json;
    }

    to_text() { return "$$\n" + this.to_latex() + "\n$$"; }

    // Invoke fn once for each subexpression in this expression tree (including 'this').
    // The visiting is performed depth-first, left-to-right, so should correspond visually
    // to the left-to-right rendering of the expression.
    visit(fn) { fn(this); }

    // Find the first DeferExpr that exists in this expression.  Returns null if none.
    find_defer() {
        let found = null;
        this.visit(expr => {
            if(expr.expr_type() === 'defer' && !found)
                found = expr;
        });
        return found;
    }

    // Return a (possibly) new Expr with old_expr substituted for new_expr, if old_expr is present.
    substitute_expr(old_expr, new_expr) {
        if(this === old_expr)
            return new_expr;
        else
            return this;
    }
}


// Represents a "raw" LaTeX command such as \sqrt plus optional operand expressions.
class CommandExpr extends Expr {
    // NOTES:
    //   - 'command_name' does not include the initial \ character
    //   - 'options', if provided, is a plain string that becomes "\command_name[options]{...}"
    //   - 'command_name' itself can include the options in [brackets], in which case it is
    //     automatically split off into 'options' (this is used for keybindings).
    //     (e.g.: command_name='sqrt[3]' -> command_name='sqrt', options='3'
    constructor(command_name, operand_exprs, options) {
        super();
        if(command_name.endsWith(']')) {
            const index = command_name.indexOf('[');
            this.command_name = command_name.slice(0, index);
            this.options = command_name.slice(index+1, command_name.length-1);
        }
        else {
            this.command_name = command_name;
            this.options = options === undefined ? null : options;
        }
        this.operand_exprs = operand_exprs || [];
    }

    operand_count() { return this.operand_exprs.length; }
    expr_type() { return 'command'; }
    json_keys() { return ['command_name', 'operand_exprs', 'options']; }

    emit_latex(emitter) {
        emitter.command(this.command_name, this.options);
        // Braces need to be forced around each operand, even single-letter operands.
        this.operand_exprs.forEach(operand_expr => emitter.grouped_expr(operand_expr, 'force'));
    }

    visit(fn) {
        fn(this);
        this.operand_exprs.forEach(operand_expr => operand_expr.visit(fn));
    }

    substitute_expr(old_expr, new_expr) {
        if(this === old_expr) return new_expr;
        return new CommandExpr(
            this.command_name,
            this.operand_exprs.map(operand_expr => operand_expr.substitute_expr(old_expr, new_expr)),
            this.options
        );
    }
}


// Represents one expression in front of another.
// This is mainly used to keep track of whether an expression starts with a unary '-',
// so that we can automatically reverse the sign when combining it with another expression
// with infix '+', etc.
class PrefixExpr extends Expr {
    constructor(base_expr, prefix_expr) {
        super();
        this.base_expr = base_expr;
        this.prefix_expr = prefix_expr;
    }

    expr_type() { return 'prefix'; }

    json_keys() { return ['base_expr', 'prefix_expr']; }

    emit_latex(emitter) {
        emitter.expr(this.prefix_expr);
        emitter.expr(this.base_expr);
    }

    visit(fn) {
        this.prefix_expr.visit(fn);
        fn(this);
        this.base_expr.visit(fn);
    }

    substitute_expr(old_expr, new_expr) {
        if(this === old_expr) return new_expr;
        return new PrefixExpr(
            this.base_expr.substitute_expr(old_expr, new_expr),
            this.prefix_expr.substitute_expr(old_expr, new_expr));
    }
}


// Represents two expressions joined by textual infix (something like + or \wedge).
// This is similar to concatenated TextNodes, but using InfixExpr lets things like ArrayExpr
// automatically detect where to put alignments when the contents are InfixExprs.
// NOTE: it's possible for left_expr or right_expr to be null; in that case, the corresponding
// "side" isn't rendered.
class InfixExpr extends Expr {
    // split can be null, 'before', or 'after'.
    // If it's non-null, the equation is split via \\ and \qquad, either before or after the infix.
    constructor(operator_expr, left_expr, right_expr, split) {
        super();
        this.operator_expr = operator_expr;
        this.left_expr = left_expr;
        this.right_expr = right_expr;
        this.split = split || null;  // to avoid 'undefined's in the JSON
    }

    expr_type() { return 'infix'; }

    json_keys() { return ['operator_expr', 'left_expr', 'right_expr', 'split']; }

    // If the infix operator is a simple command like '+' or '\cap', return it
    // (without the initial \ if it has one).  If it's anything more complex, return null.
    operator_text() {
        const op_expr = this.operator_expr;
        if(op_expr.expr_type() === 'command' && op_expr.operand_count() === 0)
            return op_expr.command_name;
        else if(op_expr.expr_type() === 'text')
            return op_expr.text;
        else
            return null;
    }

    // Check if this is a low-precedence infix expression like x+y
    // This is mostly for convenience so it doesn't need to be that precise.
    needs_autoparenthesization() {
        const op = this.operator_text();
        return op && (op === '+' || op === '-');
    }

    emit_latex(emitter) {
        if(this.left_expr)
            emitter.expr(this.left_expr);
        if(this.split === 'before') {
            emitter.command("\\");
            emitter.command("qquad");
        }
        emitter.expr(this.operator_expr);
        if(this.split === 'after') {
            emitter.command("\\");
            emitter.command("qquad");
        }
        if(this.right_expr)
            emitter.expr(this.right_expr);
    }

    visit(fn) {
        if(this.left_expr) this.left_expr.visit(fn);
        this.operator_expr.visit(fn);
        fn(this);
        if(this.right_expr) this.right_expr.visit(fn);
    }

    substitute_expr(old_expr, new_expr) {
        if(this === old_expr) return new_expr;
        return new InfixExpr(
            this.operator_expr.substitute_expr(old_expr, new_expr),
            this.left_expr.substitute_expr(old_expr, new_expr),
            this.right_expr.substitute_expr(old_expr, new_expr),
            this.split);
    }

    // Returns an InfixExpr like this one, but with the specified split mode set.
    with_split_mode(new_split_mode) {
        return new InfixExpr(
            this.operator_expr, this.left_expr, this.right_expr, new_split_mode);
    }
}


// Represents a "defer marker" that can be used with the 'substitute_defer' command.
class DeferExpr extends Expr {
    expr_type() { return 'defer'; }
    json_keys() { return []; }

    emit_latex(emitter) {
        const expr = new CommandExpr('htmlClass', [
            new TextExpr('defer_expr'), new TextExpr("\\blacksquare")]);
        emitter.expr(expr);
    }
}


// Represents a snippet of LaTeX code; these are the "leaves" of Expr-trees.
class TextExpr extends Expr {
    constructor(text) {
        super();
        this.text = text;
    }

    expr_type() { return 'text'; }
    json_keys() { return ['text']; }

    emit_latex(emitter) { emitter.text(this.text); }
}


// Represents a sequence of expressions all concatenated together.
// Adjacent SequenceExprs can be merged together; see Expr.combine_pair().
class SequenceExpr extends Expr {
    constructor(exprs) {
        super();
        this.exprs = exprs;
    }

    expr_type() { return 'sequence'; }
    json_keys() { return ['exprs']; }

    emit_latex(emitter) {
        this.exprs.forEach(expr => emitter.expr(expr));
    }

    visit(fn) {
        fn(this);
        this.exprs.forEach(expr => expr.visit(fn));
    }

    substitute_expr(old_expr, new_expr) {
        if(this === old_expr) return new_expr;
        return new SequenceExpr(
            this.exprs.map(expr => expr.substitute_expr(old_expr, new_expr)));
    }
}


// Represents an expression enclosed in (flexible) left/right delimiters.
// \left( ... \right)
// If there is more than one inner_expr, they'll be separated with this.middle_type
// e.g.: \left( x \middle| y \right)
class DelimiterExpr extends Expr {
    static parenthesize(expr) {
        return new DelimiterExpr('(', ')', null, [expr]);
    }

    // Parenthesize 'expr' only if it's a low-precedence InfixExpr like 'x+y'.
    static autoparenthesize(expr) {
        if(expr.expr_type() === 'infix' && expr.needs_autoparenthesization())
            return DelimiterExpr.parenthesize(expr);
        else
            return expr;
    }
    
    constructor(left_type, right_type, middle_type, inner_exprs) {
        super();
        this.left_type = left_type;
        this.right_type = right_type;
        this.middle_type = middle_type || null;  // to avoid 'undefined's in the JSON
        this.inner_exprs = inner_exprs || [];
    }

    expr_type() { return 'delimiter'; }
    json_keys() { return ['left_type', 'right_type', 'middle_type', 'inner_exprs']; }

    emit_latex(emitter) {
        emitter.command('left');
        emitter.text_or_command(this.left_type);
        this.inner_exprs.forEach((expr, index) => {
            if(index > 0) {
                emitter.command('middle');
                emitter.text_or_command(this.middle_type || '|');
            }
            emitter.expr(expr);
        });
        emitter.command('right');
        emitter.text_or_command(this.right_type);
    }

    visit(fn) {
        fn(this);
        this.inner_exprs.forEach(expr => expr.visit(fn));
    }

    substitute_expr(old_expr, new_expr) {
        if(this === old_expr) return new_expr;
        return new DelimiterExpr(
            this.left_type, this.right_type, this.middle_type,
            this.inner_exprs.map(expr => expr.substitute_expr(old_expr, new_expr)));
    }
}


// Represents a base expression with either a subscript or superscript, or both.
class SubscriptSuperscriptExpr extends Expr {
    constructor(base_expr, subscript_expr, superscript_expr) {
        super();
        this.base_expr = base_expr;
        this.subscript_expr = subscript_expr;
        this.superscript_expr = superscript_expr;
    }

    expr_type() { return 'subscriptsuperscript'; }
    json_keys() { return ['base_expr', 'subscript_expr', 'superscript_expr']; }

    emit_latex(emitter) {
        // If the base_expr is a command, don't put it inside grouping braces.
        // This accounts for attaching subscripts or superscripts to commands
        // with arguments such as \underbrace{xyz}_{abc}.
        if(this.base_expr.expr_type() === 'command')
            emitter.expr(this.base_expr);
        else
            emitter.grouped_expr(this.base_expr);
        if(this.subscript_expr) {
            emitter.text('_');
            // 'force_commands' ensures that single LaTeX commands are still grouped, even
            // though single-letter super/subscripts are still OK to leave ungrouped.
            // e.g.: x^{\sum} instead of x^\sum, but x^2 is fine.
            emitter.grouped_expr(this.subscript_expr, 'force_commands');
        }
        if(this.superscript_expr) {
            emitter.text('^');
            emitter.grouped_expr(this.superscript_expr, 'force_commands');
        }
    }

    visit(fn) {
        fn(this);
        this.base_expr.visit(fn);
        if(this.subscript_expr) this.subscript_expr.visit(fn);
        if(this.superscript_expr) this.superscript_expr.visit(fn);
    }

    substitute_expr(old_expr, new_expr) {
        if(this === old_expr) return new_expr;
        return new SubscriptSuperscriptExpr(
            this.base_expr.substitute_expr(old_expr, new_expr),
            this.subscript_expr ? this.subscript_expr.substitute_expr(old_expr, new_expr) : null,
            this.superscript_expr ? this.superscript_expr.substitute_expr(old_expr, new_expr) : null);
    }
}


// \begin{bmatrix} ... etc
class ArrayExpr extends Expr {
    // split_mode:  (for placing alignment markers automatically for "\cases" and such)
    //    'none': do nothing, just put each entry_expr in its own row
    //    'infix': place alignment markers before infix, if any
    //    'colon': if there is a ':' infix, remove it and place alignment marker where it was
    //    'colon_if': like 'colon', but place the word "if" before the right-hand side if there
    //                is a ':' infix.  If there is no ':' infix, the right-hand side becomes 'otherwise'.
    static split_elements(exprs, split_mode) {
        return exprs.map(expr => ArrayExpr._split_expr(expr, split_mode));
    }

    // Split up 'expr' into separately-aligned 'columns'.
    static _split_expr(expr, split_mode) {
        switch(split_mode) {
        case 'none':
            return [expr];
        case 'infix':
            if(expr.expr_type() === 'infix')
                return [expr.left_expr, new InfixExpr(expr.operator_expr, null, expr.right_expr)];
            else
                return [expr, null];
        case 'colon':
            if(expr.expr_type() === 'infix' && expr.operator_text() === ':')
                return [expr.left_expr, expr.right_expr];
            else
                return [expr, null];
        case 'colon_if':
            if(expr.expr_type() === 'infix' && expr.operator_text() === ':')
                return [
                    expr.left_expr,
                    Expr.combine_pair(
                        Expr.combine_pair(
                            new CommandExpr('mathrm', [new TextExpr('if')]),
                            new CommandExpr('enspace'), []),
                        expr.right_expr)];
            else
                return [
                    expr,
                    new CommandExpr('mathrm', [new TextExpr('otherwise')])];
        default:
            return [expr];
        }
    }
    
    constructor(array_type, row_count, column_count, element_exprs) {
        super();
        this.array_type = array_type;
        this.row_count = row_count;
        this.column_count = column_count;
        this.element_exprs = element_exprs;
    }

    expr_type() { return 'array'; }
    json_keys() { return ['array_type', 'row_count', 'column_count']; }

    is_matrix() {
        const t = this.array_type;
        // TODO: t.endsWith('matrix')?
        return (t === 'bmatrix' || t === 'Bmatrix' || t === 'matrix' ||
                t === 'pmatrix' || t === 'vmatrix' || t === 'Vmatrix');
    }

    to_json() {
        let json = super.to_json();
        json.element_exprs = this.element_exprs.map(
            row_exprs => row_exprs.map(expr => expr.to_json()));
        return json;
    }

    // Return a new ArrayExpr like this one, but with ellipses inserted before the
    // last row and column, and along the diagonal.
    // NOTE: is_matrix() should be true before calling this.
    with_ellipses() {
        if(this.row_count <= 1 || this.column_count <= 1)
            return this;
        const make_cell = (content) => new TextExpr(content);
        let new_element_exprs = this.element_exprs.map((row_exprs, index) => [
            ...row_exprs.slice(0, -1),
            make_cell((index === 0 || index === this.row_count-1) ? "\\cdots" : ''),
            row_exprs[this.column_count-1]
        ]);
        let inserted_row_exprs = [make_cell("\\vdots")];
        for(let i = 0; i < this.column_count-2; i++)
            inserted_row_exprs.push(make_cell(''));
        inserted_row_exprs.push(make_cell("\\ddots"));
        inserted_row_exprs.push(make_cell("\\vdots"));
        new_element_exprs.splice(this.row_count-1, 0, inserted_row_exprs);
        return new ArrayExpr(this.array_type, this.row_count+1, this.column_count+1, new_element_exprs);
    }

    // Return a new ArrayExpr with rows and columns interchanged.
    // NOTE: is_matrix() should be true before calling this.
    transposed() {
        let new_element_exprs = [];
        for(let i = 0; i < this.column_count; i++)
            new_element_exprs.push(this.element_exprs.map(
                row_exprs => this._transpose_cell(row_exprs[i])));
        return new ArrayExpr(this.array_type, this.column_count, this.row_count, new_element_exprs);
    }

    // When transposing a matrix, we generally want to flip vertical and horizontal ellipses
    // within the cells.
    _transpose_cell(cell_expr) {
        if(cell_expr.expr_type() === 'text') {
            switch(cell_expr.text) {
            case "\\vdots": return new TextExpr("\\cdots");
            case "\\cdots": return new TextExpr("\\vdots");
            default: break;
            }
        }
        return cell_expr;
    }

    // Return an array of 1xN ArrayExprs, one for each row in this matrix.
    // NOTE: is_matrix() should be true before calling this.
    split_rows() {
        return this.element_exprs.map(
            row_exprs => new ArrayExpr(this.array_type, 1, this.column_count, [row_exprs]));
    }

    emit_latex(emitter) {
        emitter.begin_environment(this.array_type);
        this.element_exprs.forEach((row_exprs, row_index) => {
            if(row_index > 0) emitter.row_separator();
            row_exprs.forEach((expr, col_index) => {
                if(col_index > 0) emitter.align_separator();
                if(expr) emitter.expr(expr);
            });
        });
        emitter.end_environment(this.array_type);
    }

    visit(fn) {
        fn(this);
        this.element_exprs.forEach(
            row_exprs => row_exprs.forEach(expr => expr.visit(fn)));
    }

    substitute_expr(old_expr, new_expr) {
        if(this === old_expr) return new_expr;
        const new_element_exprs = this.element_exprs.map(
            row_exprs => row_exprs.map(
                expr => expr.substitute_expr(old_expr, new_expr)));
        return new ArrayExpr(this.array_type, this.row_count, this.column_count, new_element_exprs);
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

    static from_json(json) {
        switch(json.item_type) {
        case 'expr':
            return new ExprItem(
                Expr.from_json(json.expr),
                json.tag_expr ? Expr.from_json(json.tag_expr) : null);
        case 'text':
            return new TextItem(
                json.elements.map(element_json => TextItemElement.from_json(element_json)),
                !!json.is_heading);
        case 'separator':
            return new SeparatorItem(json.separator_type);
        default:
            return TextItem.from_string('invalid item type ' + json.item_type);
        }
    }

    // // Create an appropriate Item subclass instance for the given string.
    // // If string is wrapped in $$ pairs, it's treated as an ExprItem containing raw LaTeX code.
    // // Otherwise, it's treated as Markdown text.
    // static from_string(string) {
    //     string = (string || '').trim();
    //     // NOTE: .slice(2) here is to avoid pathological cases '$$', '$$$'
    //     if(string.startsWith('$$') && string.slice(2).endsWith('$$')) {
    //         const latex = string.slice(2, -2);
    //         return new ExprItem(new TextExpr(latex));
    //     }
    //     else
    //         return new MarkdownItem(string);
    // }
    
    constructor() {
        this.serial = Item.next_serial();
    }

    react_key(prefix) { return prefix + '_' + this.serial; }

    // Subclasses need to override these:
    item_type() { return '???'; }
    to_json() { return {}; }
    to_text() { return '???'; }

    // Return a new Item of the same type and contents (shallow copy) but with a new serial_number.
    // This is mainly needed for React, which needs a distinct React key for each item in
    // a list (like the list of stack items).  Things like 'dup' that can duplicate objects
    // need to make sure to use clone() so that every Item in the stack/document is distinct.
    clone() { return null; }
}

// iOS Safari workaround
Item.serial_number = 1;


// Represents a math expression (Expr instance) in the stack or document.
class ExprItem extends Item {
    // tag_expr is an optional tag shown to the right of the item.
    constructor(expr, tag_expr) {
        super()
        this.expr = expr;
        this.tag_expr = tag_expr;
    }

    item_type() { return 'expr'; }

    to_json() {
        let json = {item_type: 'expr', expr: this.expr.to_json()};
        if(this.tag_expr) json.tag_expr = this.tag_expr.to_json();
        return json;
    }

    to_text() { return this.expr.to_text(); }

    clone() { return new ExprItem(this.expr, this.tag_expr); }
}


// Item that visually separates parts of the document.
// Currently the only supported separator_type is 'hrule'.
class SeparatorItem extends Item {
    constructor(separator_type) {
        super();
        this.separator_type = separator_type;
    }

    item_type() { return 'separator'; }

    to_json() {
        return {item_type: 'separator', separator_type: this.separator_type};
    }

    to_text() { return "\\rule"; }

    clone() { return new SeparatorItem(this.separator_type); }
}


class TextItemElement {
    static from_json(json) {
        if(json.expr)
            return new TextItemExprElement(Expr.from_json(json.expr));
        else if(json.text)
            return new TextItemTextElement(json.text);
        else
            return new TextItemRawElement(json.raw);
    }

    is_text() { return false; }
    is_expr() { return false; }
    is_raw() { return false; }
}


class TextItemTextElement extends TextItemElement {
    constructor(text) { super(); this.text = text; }

    is_text() { return true; }
    to_json() { return { 'text': this.text }; }
    to_text() { return this.text; }

    to_latex() {
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
            pieces.push("\\text{");
            pieces.push(this._latex_escape(tokens[i]));
            if(i < tokens.length-1)
                pieces.push(' ');  // preserve spacing between words
            pieces.push("}\\allowbreak ");
        }
        return pieces.join('');
    }

    _latex_escape(text) {
        // TODO: make this table a global (or switch statement) so it doesn't constantly get remade
        const replacements = {
            '_': "\\_",
            '^': "\\wedge ",
            '%': "\\%",
//            "'": "\\prime ",
            "`": "\\backprime ",
            '$': "\\$",
            '&': "\\&",
            '#': "\\#",
            '}': "\\}",
            '{': "\\{",
            '~': "\\sim ",
            "\\": "\\backslash "
        };
        return text.replaceAll(/[_^%`$&#}{~\\]/g, match => replacements[match]);
    }
}

class TextItemExprElement extends TextItemElement {
    constructor(expr) { super(); this.expr = expr; }
    is_expr() { return true; }
    to_json() { return { 'expr': this.expr.to_json() }; }
    to_text() { return '$' + this.expr.to_latex() + '$'; }
    to_latex() { return this.expr.to_latex(); }
}


// Represents a "raw" piece of LaTeX text (similar to TextExpr) within a TextItem.
// This is used for things like combining a TextItem and ExprItem with an infix operator.
// TextItemTextElement can't be used for the infix itself because we don't want to wrap it
// in a \text{...} and we don't want to escape the operator's actual LaTeX command.
class TextItemRawElement extends TextItemElement {
    constructor(string) { super(); this.string = string; }
    is_raw() { return true; }
    to_json() { return { 'raw': this.string }; }
    to_text() { return this.string; }
    to_latex() { return this.string; }
    is_explicit_space() { return this.string === "\\,"; }
}


class TextItem extends Item {
    static from_string(string) { return new TextItem([new TextItemTextElement(string)]); }

    static from_expr(expr) { return new TextItem([new TextItemExprElement(expr)]); }

    // Like from_string, but if the string contains "[]" sequences, these are parsed out
    // and converted into DeferExpr placeholders.
    static from_string_with_placeholders(string) {
        const pieces = string.split('[]');
        let elements = [];
        for(let i = 0; i < pieces.length; i++) {
            elements.push(new TextItemTextElement(pieces[i]));
            if(i < pieces.length-1)
                elements.push(new TextItemExprElement(new DeferExpr()));
        }
        return new TextItem(elements);
    }

    // item1/2 can each be TextItems or ExprItems.
    static concatenate_items(item1, item2, separator_text) {
        if(item1.item_type() === 'expr') item1 = TextItem.from_expr(item1.expr);
        if(item2.item_type() === 'expr') item2 = TextItem.from_expr(item2.expr);
        const elements = item1.elements.concat(
            separator_text ? [new TextItemRawElement(separator_text)] : [],
            item2.elements);
        // Coalesce adjacent elements.  Rules are:
        //   - Adjacent TextElements are concatenated directly.
        //   - A RawElement representing an explicit space character (\,) is absorbed into an
        //     adjacent TextElement as a normal space character (this is to make the spacing
        //     less weird when attaching a text and expression via an infix space).
        let merged_elements = [elements[0]];
        for(let i = 1; i < elements.length; i++) {
            const last_index = merged_elements.length-1;
            const last_merged_element = merged_elements[last_index];
            if(last_merged_element.is_text() && elements[i].is_text()) {
                // Two adjacent TextElements.
                merged_elements[last_index] = new TextItemTextElement(
                    last_merged_element.text + elements[i].text);
            }
            else if(last_merged_element.is_raw() && last_merged_element.is_explicit_space() &&
                    elements[i].is_text()) {
                // raw space + TextElement
                merged_elements[last_index] = new TextItemTextElement(' ' + elements[i].text);
            }
            else if(last_merged_element.is_text() &&
                    elements[i].is_raw() && elements[i].is_explicit_space()) {
                // TextElement + raw space
                merged_elements[last_index] = new TextItemTextElement(last_merged_element.text + ' ');
            }
            else {
                // Any other combinations are left alone.
                merged_elements.push(elements[i]);
            }
        }
        return new TextItem(merged_elements, item1.is_heading || item2.is_heading);
    }

    constructor(elements, is_heading) {
        super();
        this.elements = elements;
        this.is_heading = !!is_heading;
    }

    item_type() { return 'text'; }

    to_json() {
        let json = {
            item_type: 'text',
            elements: this.elements.map(element => element.to_json())
        };
        // avoid lots of useless is_heading: false in the JSON
        if(this.is_heading) json.is_heading = true;
        return json;
    }

    to_text() { return this.elements.map(element => element.to_text()).join(''); }
    to_latex() { return this.elements.map(element => element.to_latex()).join(''); }
    clone() { return new TextItem(this.elements, this.is_heading); }

    // If there is any DeferExpr among the elements in this TextItem, substitute
    // the first one for substitution_expr and return the new TextItem.
    // If there are no DeferExprs available, return null.
    try_substitute_defer(substitution_expr) {
        let new_elements = [...this.elements];  // make a shallow copy
        for(let i = 0; i < new_elements.length; i++) {
            if(new_elements[i].is_expr()) {
                const defer_expr = new_elements[i].expr.find_defer();
                if(defer_expr) {
                    const new_expr = new_elements[i].expr.substitute_expr(defer_expr, substitution_expr);
                    new_elements[i] = new TextItemExprElement(new_expr);
                    return new TextItem(new_elements, this.is_heading);
                }
            }
        }
        return null;
    }
}


// NOTE: All stack operations return a new Stack with the modified
// items, leaving the original untouched.
class Stack {
    static from_json(json) {
        const items = json.items.map(item_json => Item.from_json(item_json));
        return new Stack(items);
    }
    
    constructor(items) {
        this.items = items;
    }

    depth() { return this.items.length; }
    check(n) { return this.depth() >= n; }

    // Check that at least n items are available and that they are all ExprItems
    check_exprs(n) {
        if(!this.check(n)) return false;
        for(let i = 0; i < n; i++)
            if(this.items[this.items.length-1-i].item_type() !== 'expr')
                return false;
        return true;
    }

    // Fetch item at position n (stack top = 1, next = 2, etc)
    peek(n) {
        if(!this.check(1)) this.underflow();
        return this.items[this.items.length - n];
    }

    // Returns [new_stack, item1, item2, ...]
    pop(n) {
        if(n === undefined) n = 1;
        if(!this.check(n)) this.underflow();
        return this._unchecked_pop(n);
    }

    // Like pop(n) but all the items have to be ExprItems.
    pop_exprs(n) {
        if(!this.check(n)) this.underflow();
        if(!this.check_exprs(n)) this.type_error();
        const [new_stack, ...items] = this._unchecked_pop(n);
        return [new_stack, ...items.map(item => item.expr)];
    }

    pop_matrices(n) {
        const [new_stack, ...exprs] = this.pop_exprs(n);
        if(exprs.every(expr => expr.expr_type() === 'array' && expr.is_matrix()))
            return [new_stack, ...exprs];
        else
            this.type_error();
    }

    _unchecked_pop(n) {
        return [new Stack(this.items.slice(0, -n))].concat(this.items.slice(-n));
    }
    
    push_all(items) {
        if(!items.every(item => item instanceof Item))
            throw new Error('pushing invalid item onto stack');
        return new Stack(this.items.concat(items));
    }
    
    push_all_exprs(exprs) { return this.push_all(exprs.map(expr => new ExprItem(expr))); }
    push(item) { return this.push_all([item]); }
    push_expr(expr) { return this.push_all_exprs([expr]); }

    // Return a new Stack with cloned copies of all the items.
    // The cloned items will have new React IDs, which will force a re-render of the items.
    // This is used for things like changing between display and inline math mode, where
    // the item content doesn't change but the way it's rendered does.
    clone_all_items() {
        return new Stack(this.items.map(item => item.clone()));
    }

    underflow() { throw new Error('stack_underflow'); }
    type_error() { throw new Error('stack_type_error'); }

    to_json() {
        return {
            object_type: 'stack',
            items: this.items.map(item => item.to_json())
        };
    }
}


class Document {
    static from_json(json) {
        return new Document(
            json.items.map(item_json => Item.from_json(item_json)),
            json.selection_index || 0);
    }

    // NOTE: selection_index can be in the range 0..items.length (inclusive).
    constructor(items, selection_index) {
        this.items = items || [];
        this.selection_index = selection_index;
    }

    selected_item() {
        if(this.selection_index > 0)
            return this.items[this.selection_index-1];
        else
            return null;
    }

    // Insert a new item below the current selection, and select the inserted item.
    // Returns a modified Document; does not alter this one.
    insert_item(new_item) {
        const index = this.selection_index;
        const new_items = this.items.slice(0, index).concat([new_item], this.items.slice(index));
        return new Document(new_items, index+1);
    }

    // Return the new Document if the selection was deleted successfully.
    // Selects the item that was before this one (or select the 'document top' if this was the first).
    // Return null if the selection is "invalid" (e.g., empty document).
    delete_selection() {
        const index = this.selection_index;
        if(index > 0) {
            const new_items = this.items.slice(0, index-1).concat(this.items.slice(index));
            return new Document(new_items, index-1);
        }
        else
            return null;
    }

    move_selection_by(offset) {
        let new_index = this.selection_index + offset;
        if(new_index < 0) new_index = 0;
        if(new_index > this.items.length) new_index = this.items.length;
        return new Document(this.items, new_index);
    }

    // If there is a current selection, move it by the given offset.
    // Returns the changed document if anything was done.
    shift_selection_by(offset) {
        const item = this.selected_item();
        if(!item ||
           this.selection_index + offset <= 0 ||
           this.selection_index + offset > this.items.length)
            return null;
        else
            return this.delete_selection().move_selection_by(offset).insert_item(item);
    }

    // See Stack.clone_all_items()
    clone_all_items() {
        return new Document(this.items.map(item => item.clone()), this.selection_index);
    }

    to_json() {
        return {
            object_type: 'document',
            items: this.items.map(item => item.to_json()),
            selection_index: this.selection_index
        };
    }

    to_text() {
        return this.items.map(item => item.to_text()).join("\n\n");
    }
}


export {
    Keymap, Settings, AppState, UndoStack, DocumentStorage, ImportExportState, FileManagerState,
    Expr, CommandExpr, PrefixExpr, InfixExpr, DeferExpr, TextExpr, SequenceExpr,
    DelimiterExpr, SubscriptSuperscriptExpr, ArrayExpr,
    Item, ExprItem, TextItem, SeparatorItem, Stack, Document
};

