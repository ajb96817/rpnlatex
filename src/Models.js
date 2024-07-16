

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
        Settings.saved_keys.forEach(key => { s[key] = json[key]; });
        return s;
    }
    
    constructor() {
        this.current_keymap = new Keymap();
        this.inverse_video = false;
        this.last_opened_filename = null;
        this.popup_mode = null;  // null, 'help', 'files'
        this.show_mode_indicator = true;
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

        // Set overall font scale factor.
        const root_elt = document.getElementById('root');
        const percentage = Math.round(100*Math.pow(1.05, layout.zoom_factor || 0));
        root_elt.style.fontSize = percentage + '%';

        // Set some specific scale factors for other UI elements
        // by manipulating the corresponding CSS variables.
        const root_vars = document.querySelector(':root');
        const itembar_pixels = Math.min(10, Math.max(2, Math.round(4 * percentage/100)));
        root_vars.style.setProperty('--itemtype-bar-width', itembar_pixels + 'px');
        const headingbar_pixels = Math.max(1, Math.round(3 * percentage/100));
        root_vars.style.setProperty('--heading-bar-height', headingbar_pixels + 'px');

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
    'inverse_video',
    'last_opened_filename',
    'popup_mode',
    'layout',
    'show_mode_indicator'
];


// Helper for generating LaTeX strings from Expr objects.
class LatexEmitter {
    // selected_expr_path is optional, but if provided it is an ExprPath
    // object that indicates which Expr is to be rendered with a "highlight"
    // indicating that it is currently selected.
    constructor(base_expr, selected_expr_path) {
        this.base_expr = base_expr;
        this.tokens = [];
        this.last_token_type = null;
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
    // This is used to correlate with this given this.selected_expr_path
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
        this.document = document || new Document([], 0);
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
// children of the Expr at that level.  In the current implementation, the
// path must be at least of length 1; in other words an ExprPath can't refer
// directly to its base expression.
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

    // Return a new Expr that is like this one but with the "sibling" subexpression
    // in the given direction selected.
    // 'direction' can be 'left' or 'right'.  The selection wraps around when going
    // past the ends of the expression.
    move(direction) {
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
// Rules:
//   - Spaces are completely ignored.
//   - "Symbols" are one-letter substrings like 'x'.
//   - Adjacent factors are combined with implicit multiplication.
//   - 'xyz' is considered implicit multiplication of x,y,z.
//   - '*' is multiplication, but gets converted to \cdot.
//   - '/' and '*' bind tighter than '+' and '-'.
//   - Delimiters can be used, but must match properly; e.g. 10[x+(y-3)]
//   - Postfix factorial notation is allowed.
//
// Mini-grammar:
//   expr:
//       '-' term |
//           term |
//       '-' term [+ | -] term |
//           term [+ | -] term
//   term:
//       factor |
//       factor '!' |
//       factor [* | /] term
//       factor term    (implicit multiplication)
//   factor:
//       number |
//       symbol |
//       '(' expr ')'     (delimiter types must match)
//
// TODO: -> ExprTextParser?  
class TextExprParser {
    static parse_string(string) {
        const tokens = this.tokenize(string);
        if(!tokens) return null;
        let parser = new TextExprParser(tokens);
        let expr = null;
        try {
            expr = parser.parse_expr();
        } catch(e) {
            if(e.message === 'parse_error')
                ;  // leave expr as null
            throw e;
        }
        if(!expr) return null;
        if(!parser.at_end()) return null;  // extraneous tokens at end
        return expr;
    }
    
    // Break string into to tokens; token types are:
    //   number: 3, -5, 3.1, -5.1, etc. (no scientific notation or anything)
    //   symbol: x (xyz becomes 3 separate symbols)
    //   operator: +, -, *, /, !
    //   open_delimiter: ( or [ or {
    //   close_delimiter: ) or ] or }
    static tokenize(s) {
        let pos = 0;
        let number_regex = /-?\d*\.?\d+/g;
        let tokens = [];
        while(pos < s.length) {
            // Check for number:
            number_regex.lastIndex = pos;
            const result = number_regex.exec(s);
            if(result && result.index === pos) {
                tokens.push({type: 'number', text: result[0]});
                pos += result[0].length;
            }
            else {
                // All other tokens are always 1 character.
                const token = s[pos];
                let token_type = null;
                if(/\s/.test(token)) token_type = 'whitespace';
                if(/\w/.test(token)) token_type = 'symbol';
                if(/[-+!/*]/.test(token)) token_type = 'operator';
                if(/[([{]/.test(token)) token_type = 'open_delimiter';
                if(/[)\]}]/.test(token)) token_type = 'close_delimiter';
                if(token_type === null)
                    return null;  // invalid token found (something like ^, or unicode)
                if(token_type !== 'whitespace')  // skip whitespace
                    tokens.push({type: token_type, text: token});
                pos++;
            }
        }
        return tokens;
    }

    constructor(tokens) {
        this.tokens = tokens;
        this.token_index = 0;
    }

    parse_expr() {
        const prefix_token = this.peek_for('operator');
        let negate = false;
        if(prefix_token && prefix_token.text === '-') {
            negate = true;
            this.next_token();
        }
        const lhs = this.parse_term() || this.parse_error();
        const binary_token = this.peek_for('operator');
        let result_expr = lhs;
        if(binary_token &&
           (binary_token.text === '+' || binary_token.text === '-')) {
            this.next_token();
            const rhs = this.parse_term() || this.parse_error();
            result_expr = InfixExpr.combine_infix(
                lhs, rhs, Expr.text_or_command(binary_token.text));
        }
        if(negate)  // prepend unary -
            result_expr = Expr.combine_pair(
                Expr.text_or_command('-'), result_expr);
        return result_expr;
    }

    parse_term() {
        const lhs = this.parse_factor();
        if(!lhs) return null;
        const op_token = this.peek_for('operator');
        if(op_token && op_token.text === '!') {
            // postfix factorial
            this.next_token();
            return Expr.combine_pair(lhs, Expr.text_or_command('!'));
        }
        if(op_token && (op_token.text === '*' || op_token.text === '/')) {
            // explicit multiplication converts to \cdot
            const op_text = (op_token.text === '*' ? "\\cdot" : '/');
            this.next_token();
            const rhs = this.parse_term() || this.parse_error();
            return InfixExpr.combine_infix(
                lhs, rhs, Expr.text_or_command(op_text));
        }
        const rhs = this.parse_term();  // NOTE: not an error if null
        if(rhs) {
            // factor factor (implicit multiplication)
            // Special case: if both factors are literal numbers, an explicit \cdot will
            // be inserted between them to indicate the multiplication.  The same applies
            // if the right hand side is already such a \cdot form.
            if(lhs.expr_type() === 'text' && lhs.looks_like_number() &&
               ((rhs.expr_type() === 'text' && rhs.looks_like_number()) ||
                (rhs.expr_type() === 'infix' &&
                 rhs.operand_exprs.every(expr => expr.expr_type() === 'text' && expr.looks_like_number()) &&
                 rhs.operator_exprs.every(expr => rhs.operator_text(expr) === 'cdot'))))
                return InfixExpr.combine_infix(lhs, rhs, Expr.text_or_command("\\cdot"));
            else
                return Expr.combine_pair(lhs, rhs);
        }
        else
            return lhs;  // factor by itself
    }

    parse_factor() {
        if(this.peek_for('number') || this.peek_for('symbol'))
            return new TextExpr(this.next_token().text);
        if(this.peek_for('open_delimiter')) {
            const open_delim_type = this.next_token().text;
            const expr = this.parse_expr() || this.parse_error();
            if(!this.peek_for('close_delimiter'))
                return this.parse_error();
            const close_delim_type = this.next_token().text;
            if(this.matching_closing_delimiter(open_delim_type) !== close_delim_type)
                return this.parse_error();  // mismatched delimiters
            let [left, right] = [open_delim_type, close_delim_type];
            if(open_delim_type === '{')
                [left, right] = ["\\{", "\\}"];  // latex-compatible form
            return new DelimiterExpr(left, right, expr);
        }
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
        else return null;
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


// Abstract superclass for expression trees.
class Expr {
    static from_json(json) {
        switch(json.expr_type) {
        case 'command':
            return new CommandExpr(
                json.command_name,
                this._list(json.operand_exprs),
                json.options);
        case 'infix':
            return new InfixExpr(
                this._list(json.operand_exprs),
                this._list(json.operator_exprs),
                json.split_at_index,
                json.linebreaks_at || []);
        case 'placeholder':
            return new PlaceholderExpr();
        case 'text':
            return new TextExpr(json.text);
        case 'sequence':
            return new SequenceExpr(
                this._list(json.exprs),
                !!json.fused);
        case 'delimiter':
            return new DelimiterExpr(
                json.left_type,
                json.right_type,
                this._expr(json.inner_expr),
                json.fixed_size);
        case 'subscriptsuperscript':
            return new SubscriptSuperscriptExpr(
                this._expr(json.base_expr),
                this._expr(json.subscript_expr),
                this._expr(json.superscript_expr));
        case 'array':
            return new ArrayExpr(
                json.array_type,
                json.row_count,
                json.column_count,
                this._list2d(json.element_exprs),
                json.row_separators,
                json.column_separators);
        default:
            return new TextExpr('invalid expr type ' + json.expr_type);
        }
    }

    // Helper routines for from_json
    static _expr(json) { return json ? Expr.from_json(json) : null; }
    static _list(json_array) { return json_array.map(expr_json => Expr.from_json(expr_json)); }
    static _list2d(json_array) { return json_array.map(row_exprs => Expr._list(row_exprs)); }
    
    // Concatenate two Exprs into one.  This will merge Exprs into adjacent SequenceExprs
    // when possible, instead of creating nested SequenceExprs.
    // The 'fused' flag of SequenceExprs can be used to prohibit combining this way.
    // InfixExprs are always parenthesized before being combined here.
    static combine_pair(left, right) {
        const left_type = left.expr_type(), right_type = right.expr_type();
        if(left_type === 'sequence' && !left.fused &&
           right_type === 'sequence' && !right.fused) {
            // Sequence + Sequence
            return new SequenceExpr(left.exprs.concat(right.exprs));
        }
        else if(left_type === 'sequence' && !left.fused &&
                right_type !== 'sequence') {
            // Sequence + NonSequence
            return new SequenceExpr(left.exprs.concat([right]));
        }
        else if(right_type === 'sequence' && !right.fused &&
                left_type !== 'sequence') {
            // NonSequence + Sequence
            return new SequenceExpr([left].concat(right.exprs));
        }
        else if(left_type === 'command' && right_type === 'command') {
            // Some types of Command can be combined in special ways
            return Expr.combine_command_pair(left, right);
        }
        else if(left_type === 'text' && left.looks_like_number() &&
                right_type === 'text' && right.looks_like_number()) {
            // Special case: combine 123 456 => 123456 if both sides are numeric
            return new TextExpr(left.text + right.text);
        }
        else {
            // NonSequence + NonSequence => Sequence
            // Always parenthesize InfixExprs before combining.
            let left_expr = (left_type === 'infix' ? DelimiterExpr.parenthesize(left) : left);
            let right_expr = (right_type === 'infix' ? DelimiterExpr.parenthesize(right) : right);
            return new SequenceExpr([left_expr, right_expr]);
        }
    }

    // Combine two CommandExprs with some special-casing for some particular command pairs.
    static combine_command_pair(left, right) {
        const left_name = left.command_name, right_name = right.command_name;

        // Try combining \boldsymbol{X...} + \boldsymbol{Y...} -> \boldsymbol{X...Y...}
        // Combining in this way fixes (or at least improves) some edge-case spacing problems with KaTeX.
        // Compare: \boldsymbol{W}\boldsymbol{A} vs. \boldsymbol{WA}
        if(left_name === 'boldsymbol' && right_name === 'boldsymbol' &&
           left.operand_count() === 1 && right.operand_count() === 1)
            return new SequenceExpr(
                [left.operand_exprs[0], right.operand_exprs[0]]
            ).as_bold();

        // Try combining adjacent integral symbols into multiple-integral commands.
        let new_command_name = null;
        if(left_name === 'int' && right_name === 'int') new_command_name = 'iint';
        if(left_name === 'iint' && right_name === 'int') new_command_name = 'iiint';
        if(left_name === 'int' && right_name === 'iint') new_command_name = 'iiint';
        if(left_name === 'oint' && right_name === 'oint') new_command_name = 'oiint';
        if(left_name === 'oiint' && right_name === 'oint') new_command_name = 'oiiint';
        if(left_name === 'oint' && right_name === 'oiint') new_command_name = 'oiiint';
        if(new_command_name)
            return new CommandExpr(new_command_name);

        // Everything else just becomes a SequenceExpr.
        return new SequenceExpr([left, right]);
    }

    // Combine two Exprs with the given conjunction phrase between them, with largish spacing.
    // For example "X  iff  Y" as in the [,][F] command.
    // is_bold will make the conjunction phrase bolded.
    static combine_with_conjunction(left, right, phrase, is_bold) {
        const conjunction_expr = new SequenceExpr([
            new CommandExpr('quad'),
            new CommandExpr(
                is_bold ? 'textbf' : 'text',
                [new TextExpr(phrase)]),
            new CommandExpr('quad')]);
        return InfixExpr.combine_infix(left, right, conjunction_expr);
    }

    // Convert a string into a TextExpr, or a CommandExpr if it begins
    // with \ (i.e. a latex command).
    static text_or_command(s) {
        if(s.startsWith("\\"))
            return new CommandExpr(s.slice(1));
        else
            return new TextExpr(s);
    }
    
    expr_type() { return '???'; }

    to_latex(selected_expr_path) {
        let emitter = new LatexEmitter(this, selected_expr_path);
        emitter.expr(this, null);
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

    // If this expression can be 'unparsed' for editing in the minieditor, return
    // the editable string.  Return null if not possible.
    // This is the 'inverse' of TextExprParser.parse_string().
    as_editable_string() { return null; }

    // Invoke fn once for each subexpression in this expression tree (including 'this').
    // The visiting is performed depth-first, left-to-right, so should correspond visually
    // to the left-to-right rendering of the expression.
    visit(fn) { fn(this); }

    // Return a list of all immediate subexpressions of this one, in (at least approximate)
    // left-to-right order.
    subexpressions() { return []; }

    // True if this has any subexpressions to descend into via ExprPath.
    // As a special case, CommandExprs that represent font commands peek into
    // their arguments (recursively) to determine this.  This is to prevent
    // selecting "inside" font commands that only wrap a simple leaf expression.
    // This means that has_subexpressions() may sometimes return false even
    // if subexpressions() is nonempty.
    has_subexpressions() { return this.subexpressions().length > 0; }

    // Return a new Expr like this one but with the subexpression at the given index replaced
    // with a new one.  The subexpression indexes here correspond to what is returned by subexpressions().
    replace_subexpression(index, new_expr) { return this; }

    // Find the first PlaceholderExpr that exists in this expression.  Returns null if none.
    find_placeholder() {
        let found = null;
        this.visit(expr => {
            if(expr.expr_type() === 'placeholder' && !found)
                found = expr;
        });
        return found;
    }

    // Return a (possibly) new Expr with new_expr substituted for old_expr, if old_expr is present.
    substitute_expr(old_expr, new_expr) {
        if(this === old_expr)
            return new_expr;
        else
            return this;
    }

    // Attempt to evaluate this Expr numerically.
    // Only constant values and combinations of constants
    // are allowed (including e.g. sin(3) etc).
    // Return null if evaluation is not possible.
    // The evaluation might raise errors, so the caller should use
    // an exception handler.
    // Subclasses should override.
    evaluate() { return null; }

    // Attempt to evaluate this Expr numerically.
    // Returns: [expr, exact_flag] or null on failure,
    // where 'expr' is an Expr representing the result, and 'exact_flag'
    // is true if the result can be considered "exact".
    // rationalize=true here attempts to pull out factors of common
    // values like sqrt(2) or pi.  These will be multiplied into the output
    // if found.  Rationalize=false always returns a decimal TextExpr.
    // TODO: exception handler around evaluate()
    evaluate_to_expr(rationalize) {
        const value = this.evaluate();
        if(value === null) return null;
        if(rationalize) {
            const result = this.rationalize_to_expr(value);
            if(result)
                return [result, true];
        }
        // Return an approximate floating-point value instead.
        const decimal_part = value % 1.0;
        return [
            this._float_to_expr(value),
            Math.abs(decimal_part) <= 0.000001];
    }

    // Try to find a close rational approximation to value
    // or up to a factor of some common constants like sqrt(2) or pi.
    // Return an Expr if successful, otherwise null.
    rationalize_to_expr(value) {
        let result = null;
        const make_text = n => this._int_to_expr(n);
        const make_sqrt = expr => new CommandExpr('sqrt', [expr]);
        const pi_expr = new CommandExpr('pi', []);
        const two_pi_expr = Expr.combine_pair(make_text(2), pi_expr);
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
            new SubscriptSuperscriptExpr(
                pi_expr, null, make_text(2)), null);
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
        result ||= this._try_rationalize_with_factor(  // 1 / \sqrt{2pi}
            value, 1/Math.sqrt(2*Math.PI), null, make_sqrt(two_pi_expr));
        // Try sqrt(n) in the numerator for small square-free n.
        // No need to check denominators since, e.g. 1/sqrt(3) = sqrt(3)/3
        const small_squarefree = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19];
        for(let i = 0; i < small_squarefree.length; i++)
            result ||= this._try_rationalize_with_factor(
                value, Math.sqrt(small_squarefree[i]),
                make_sqrt(make_text(small_squarefree[i])), null);
        // TODO: check factors of 1+sqrt(5), 1-sqrt(5) (golden ratio-ish)
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
        const max_denom = 500;  // maximum denominator tolerated
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
                    if(final_numer === 1)
                        final_expr = numer_factor_expr;
                    else
                        final_expr = Expr.combine_pair(base_expr, numer_factor_expr);
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
                    final_expr = Expr.combine_pair(new TextExpr('-'), frac_expr);
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

    // Number formatting routines.
    // Javascript doesn't give many good options for this.
    // Mostly we want to avoid things like '3.14e28'.

    _int_to_expr(x) {
        if(isNaN(x))
            return new CommandExpr('mathrm', [new TextExpr('NaN')]);
        else if(Math.abs(x) > 1e10)
            return this._too_large_to_expr(x);
        else
            return new TextExpr(Math.floor(x).toString());
    }

    _float_to_expr(x) {
        if(isNaN(x))
            return new CommandExpr('mathrm', [new TextExpr('NaN')]);
        else if(Math.abs(x) > 1e10)
            return this._too_large_to_expr(x);
        else
            return new TextExpr(x.toFixed(6));
    }

    _too_large_to_expr(x) {
        const text = x < 0 ? '[too large (negative)]' : '[too large]';
        return new CommandExpr('textbf', [new TextExpr(text)]);
    }

    // NOTE: CommandExpr overrides this
    as_bold() { return new CommandExpr('boldsymbol', [this]); }
}


// Represents a "raw" LaTeX command such as \sqrt plus optional operand expressions.
class CommandExpr extends Expr {
    static frac(numer_expr, denom_expr) {
        return new CommandExpr(
            'frac',
            [numer_expr, denom_expr]);
    }
    
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
        if(this.command_name !== '')
            emitter.command(this.command_name, this.options);
        // Braces need to be forced around each operand, even single-letter operands.
        this.operand_exprs.forEach((operand_expr, index) =>
            emitter.grouped_expr(operand_expr, 'force', index));
    }

    visit(fn) {
        fn(this);
        this.operand_exprs.forEach(operand_expr => operand_expr.visit(fn));
    }

    subexpressions() { return this.operand_exprs; }

    // See comment in Expr.has_subexpressions().
    has_subexpressions() {
        if(this.is_font_command())
            return this.operand_exprs[0].has_subexpressions();
        else
            return super.has_subexpressions();
    }

    replace_subexpression(index, new_expr) {
        return new CommandExpr(
            this.command_name,
            this.operand_exprs.map(
                (operand_expr, op_index) => op_index === index ? new_expr : operand_expr),
            this.options);
    }

    substitute_expr(old_expr, new_expr) {
        if(this === old_expr) return new_expr;
        return new CommandExpr(
            this.command_name,
            this.operand_exprs.map(
                operand_expr => operand_expr.substitute_expr(old_expr, new_expr)),
            this.options);
    }

    evaluate() {
        const c = this.command_name;
        if(this.operand_count() === 0) {
            if(c === 'pi') return Math.PI;
        }
        if(this.operand_count() === 1) {
            // Unary functions
            const x = this.operand_exprs[0].evaluate();
            if(x === null) return null;
            if(c === 'sin') return Math.sin(x);
            if(c === 'cos') return Math.cos(x);
            if(c === 'tan') return Math.tan(x);
            if(c === 'sinh') return Math.sinh(x);
            if(c === 'cosh') return Math.cosh(x);
            if(c === 'tanh') return Math.tanh(x);
            if(c === 'sqrt') {
                if(this.options === '3')
                    return Math.cbrt(x);
                else
                    return Math.sqrt(x);
            }

            // Hacky inverse and squared trig functions.  See Actions.js do_named_function().
            if(c === 'sin^{-1}') return Math.asin(x);
            if(c === 'cos^{-1}') return Math.acos(x);
            if(c === 'tan^{-1}') return Math.atan(x);
            if(c === 'sinh^{-1}') return Math.asinh(x);
            if(c === 'cosh^{-1}') return Math.acosh(x);
            if(c === 'tanh^{-1}') return Math.atanh(x);
            if(c === 'sin^2') return Math.pow(Math.sin(x), 2);
            if(c === 'cos^2') return Math.pow(Math.cos(x), 2);
            if(c === 'tan^2') return Math.pow(Math.tan(x), 2);
            if(c === 'sinh^2') return Math.pow(Math.sinh(x), 2);
            if(c === 'cosh^2') return Math.pow(Math.cosh(x), 2);
            if(c === 'tanh^2') return Math.pow(Math.tanh(x), 2);

            if(c === 'log_2' || c === 'lg') return Math.log2(x);
            if(c === 'ln' || c === 'log') return Math.log(x);
            if(c === 'exp') return Math.exp(x);
        }
        if(this.operand_count() === 2) {
            // Binary functions
            const x = this.operand_exprs[0].evaluate();
            const y = this.operand_exprs[1].evaluate();
            if(x === null || y === null) return null;
            if(c === 'frac') return x/y;
        }
        return null;
    }

    as_editable_string() { return null; }

    // Wrap this expression in a \boldsymbol{...} command if it's not already.
    // LaTeX has different ways of expressing 'bold' so this is not quite trivial.
    // TextItem implements as_bold() in yet another way.
    as_bold() {
        if(this.command_name === 'boldsymbol')
            return this;
        else if(this.command_name === 'mathrm') {
            // Replace \mathrm with \bold (as if it were originally created with [.][e] (operator bold))
            if(this.operand_count() === 1)
                return new CommandExpr('bold', this.operand_exprs);
            else
                return this;
        }
        else if(this.command_name === 'mathtt' || this.command_name === 'mathsf' ||
                this.command_name === 'mathbb' || this.command_name === 'mathfrak' ||
                this.command_name === 'mathscr' || this.command_name === 'mathcal') {
            // For font families without bold fonts, wrap it in \pmb{} instead.
            // Since KaTeX v.0.16.2, \pmb is rendered better (via CSS shadows) which
            // makes this feasible.
            if(this.operand_count() === 1)
                return new CommandExpr('pmb', [this]);
            else
                return this;
        }
        else
            return super.as_bold();
    }

    is_font_command() {
        if(this.operand_count() !== 1)
            return false;
        const c = this.command_name;
        return c === 'boldsymbol' || c === 'bold' || c === 'pmb' ||
            c === 'mathrm' || c === 'mathtt' || c === 'mathsf' || c === 'mathbb' ||
            c === 'mathfrak' || c === 'mathscr' || c === 'mathcal' ||
            c === 'text' || c === 'textbf' || c === 'textit';
    }
}


// Represents two or more expressions joined by infix operators (like + or \wedge).
// Fields:
//   - operand_exprs: The x,y,z in 'x + y - z'.  There must be at least 2.
//   - operator_exprs: The +,- in 'x + y - z'.  Length must be 1 less than operand_exprs.
//   - split_at_index: Index of the operator_expr that is considered the 'split point'
//     for this InfixExpr.  Generally this is the last operator used to create the
//     infix expression.  For binary expressions this is 0; for something like 'x+y = z+w'
//     it would be 1 if the '=' was used to join the existing x+y and z+w.
//   - 'linebreaks_at' is an array of integers specifying where (if any) the linebreaks
//     occur in this expression.  Currently linebreaks are only shown if the top-level
//     Expr in an ExprItem is an InfixExpr.  In that case, each integer index in
//     linebreaks_at indicates a line break *after* the given subexpression index.
//     For example, in 'x + y - z',
//     index=0 breaks after the 'x', index=1 breaks after the '+', etc.
class InfixExpr extends Expr {
    // Combine two existing expressions into an InfixExpr, joined by
    // 'op_expr' as the infix operator.
    // If one or both of the expressions are already InfixExprs, they are
    // flattened into a larger InfixExpr.
    static combine_infix(left_expr, right_expr, op_expr) {
        let new_operand_exprs = [];
        let new_operator_exprs = [];
        let new_linebreaks_at = [];
        let linebreaks_midpoint = null;
        if(left_expr.expr_type() === 'infix') {
            new_operand_exprs = new_operand_exprs.concat(left_expr.operand_exprs);
            new_operator_exprs = new_operator_exprs.concat(left_expr.operator_exprs);
            new_linebreaks_at = new_linebreaks_at.concat(left_expr.linebreaks_at);
            linebreaks_midpoint = 2*left_expr.operand_exprs.length;
        }
        else {
            new_operand_exprs.push(left_expr);
            linebreaks_midpoint = 2;
        }
        // Determine index of the new op_expr within the new InfixExpr;
        // this becomes the split_at_index determining where things like
        // do_infix_linebreak() apply at.
        const split_at_index = new_operator_exprs.length;
        new_operator_exprs.push(op_expr);
        if(right_expr.expr_type() === 'infix') {
            new_operand_exprs = new_operand_exprs.concat(right_expr.operand_exprs);
            new_operator_exprs = new_operator_exprs.concat(right_expr.operator_exprs);
            new_linebreaks_at = new_linebreaks_at.concat(
                right_expr.linebreaks_at.map(index => linebreaks_midpoint+index));
        }
        else
            new_operand_exprs.push(right_expr);
        return new InfixExpr(
            new_operand_exprs,
            new_operator_exprs,
            split_at_index,
            new_linebreaks_at);
    }
    
    constructor(operand_exprs, operator_exprs, split_at_index, linebreaks_at) {
        super();
        this.operand_exprs = operand_exprs;
        this.operator_exprs = operator_exprs;
        this.split_at_index = split_at_index || 0;
        this.linebreaks_at = linebreaks_at || [];
    }

    expr_type() { return 'infix'; }

    json_keys() { return ['operand_exprs', 'operator_exprs', 'split_at_index']; }

    to_json() {
        let json = super.to_json();
        if(this.linebreaks_at.length > 0)
            json.linebreaks_at = this.linebreaks_at;
        return json;
    }

    // If the given infix operator is a simple command like '+' or '\cap',
    // return the command name (without the initial \ if it has one).
    // If it's anything more complex, return null.
    // If 'op_expr' is omitted, check only the operator at the split_at point.
    operator_text(op_expr) {
        if(op_expr) {
            if(op_expr.expr_type() === 'command' && op_expr.operand_count() === 0)
                return op_expr.command_name;
            else if(op_expr.expr_type() === 'text')
                return op_expr.text;
            else
                return null;
        }
        else
            return this.operator_text(this.operator_exprs[this.split_at_index]);
    }

    operator_text_at(index) {
        return this.operator_text(this.operator_exprs[index]);
    }

    // 'Editable' version of the operator (for use in math entry mode).
    editable_operator_text_at(index) {
        const s = this.operator_text_at(index);
        if(s === '+' || s === '-' || s === '/')
            return s;
        else if(s === 'cdot')
            return '*';
        else
            return null;
    }
   

    // e.g. operator_text==='/' would match 'x/y'.
    is_binary_operator_with(operator_text) {
        return this.operator_exprs.length === 1 &&
            this.operator_text(this.operator_exprs[0]) === operator_text;
    }

    // Check if this is a low-precedence infix expression like x+y
    // This is mostly for convenience so it doesn't need to be that precise.
    needs_autoparenthesization() {
        return this.operator_exprs.every(op_expr => {
            const op = this.operator_text(op_expr);
            return op && (op === '+' || op === '-');
        });
    }

    // 'inside_delimiters' is set to true when this InfixExpr is rendered
    //   as the inner_expr of a DelimiterExpr.
    //   This gives us a chance to convert things like \parallel into
    //   their flexible \middle counterparts.
    emit_latex(emitter, inside_delimiters) {
        const is_top_level = (this === emitter.base_expr);
        for(let i = 0; i < this.operator_exprs.length; i++) {
            emitter.expr(this.operand_exprs[i], 2*i);
            if(is_top_level && this.linebreaks_at.includes(2*i)) {
                // Break before ith operator.
                emitter.command("\\");  // outputs two backslashes (LaTeX newline command)
                emitter.command("qquad");
            }
            let emitted_expr = this.operator_exprs[i];
            if(inside_delimiters) {
                // Try converting to flex delimiter.
                const converted_expr = this._convert_to_flex_delimiter(emitted_expr);
                if(converted_expr)
                    emitted_expr = converted_expr;
            }
            emitter.expr(emitted_expr, 2*i+1);
            if(is_top_level && this.linebreaks_at.includes(2*i+1)) {
                // Break after ith operator.
                emitter.command("\\");
                emitter.command("qquad");
            }
        }
        emitter.expr(
            this.operand_exprs[this.operand_exprs.length-1],
            2*this.operator_exprs.length);
    }

    _convert_to_flex_delimiter(expr) {
        let new_text = null;
        if(expr.expr_type() === 'text') {
            if(expr.text === '/')
                new_text = "\\middle/";
        }
        else if(expr.expr_type() === 'command' && expr.operand_count() === 0) {
            const command = expr.command_name;
            if(command === ",\\vert\\," || command === 'vert')
                new_text = "\\,\\middle\\vert\\,";
            else if(command === 'parallel')
                new_text ="\\,\\middle\\Vert\\,";
            else if(/*command === 'setminus' ||*/ command === 'backslash')
                new_text = "\\middle\\backslash ";
        }
        if(new_text)
            return new TextExpr(new_text);
        else
            return null;
    }

    visit(fn) {
        fn(this);
        for(let i = 0; i < this.operator_exprs.length; i++) {
            this.operand_exprs[i].visit(fn);
            this.operator_exprs[i].visit(fn);
        }
        this.operand_exprs[this.operand_exprs.length-1].visit(fn);
    }

    subexpressions() {
        // Interleave operators and operands.
        let exprs = [];
        for(let i = 0; i < this.operator_exprs.length; i++) {
            exprs.push(this.operand_exprs[i]);
            exprs.push(this.operator_exprs[i]);
        }
        exprs.push(this.operand_exprs[this.operand_exprs.length-1]);
        return exprs;
    }

    // Even indices reference operands; odd indices reference operators.
    replace_subexpression(index, new_expr) {
        return new InfixExpr(
            this.operand_exprs.map((operand_expr, expr_index) =>
                expr_index*2 === index ? new_expr : operand_expr),
            this.operator_exprs.map((operator_expr, expr_index) =>
                expr_index*2 + 1 === index ? new_expr : operator_expr),
            this.split_at_index,
            this.linebreaks_at);
    }

    substitute_expr(old_expr, new_expr) {
        if(this === old_expr) return new_expr;
        return new InfixExpr(
            this.operand_exprs.map(expr => expr.substitute_expr(old_expr, new_expr)),
            this.operator_exprs.map(expr => expr.substitute_expr(old_expr, new_expr)),
            this.split_at_index,
            this.linebreaks_at);
    }

    has_linebreak_at(index) {
        return this.linebreaks_at.includes(index);
    }

    without_linebreak_at(old_index) {
        return new InfixExpr(
            this.operand_exprs,
            this.operator_exprs,
            this.split_at_index,
            this.linebreaks_at.filter(index => index !== old_index));
    }

    with_linebreak_at(new_index) {
        return new InfixExpr(
            this.operand_exprs,
            this.operator_exprs,
            this.split_at_index,
            this.linebreaks_at.concat([new_index]));
    }

    // Swap everything to the left of operator_index with everything to the right of operator_index.
    swap_sides_at(operator_index) {
        const new_operand_exprs =
              this.operand_exprs.slice(operator_index+1).concat(
                  this.operand_exprs.slice(0, operator_index+1));
        const new_operator_exprs =
              this.operator_exprs.slice(operator_index+1).concat(
                  [this.operator_exprs[operator_index]]).concat(
                      this.operator_exprs.slice(0, operator_index));
        // NOTE: linebreaks_at is discarded here, otherwise the result
        // isn't very intuitive.
        return new InfixExpr(
            new_operand_exprs,
            new_operator_exprs,
            new_operator_exprs.length - this.split_at_index - 1);
    }

    // Extract everything to one side of the given operator index.
    // The resulting Expr may not necessarily be another InfixExpr.
    // 'side' can be 'left' or 'right'.
    // NOTE: The new split_at_index will always be 0.  There is not a good way
    // to do this properly currently since we only track the most recent operator
    // in InfixExpr.
    extract_side_at(operator_index, side) {
        if(side === 'right') {
            if(operator_index === this.operator_exprs.length-1)
                return this.operand_exprs[operator_index+1];  // rightmost operand
            else
                return new InfixExpr(
                    this.operand_exprs.slice(operator_index+1),
                    this.operator_exprs.slice(operator_index+1),
                    0, null);
        }
        else {
            if(operator_index === 0)
                return this.operand_exprs[0];  // leftmost operand
            else
                return new InfixExpr(
                    this.operand_exprs.slice(0, operator_index+1),
                    this.operator_exprs.slice(0, operator_index),
                    0, null);
        }
    }

    as_editable_string() {
        const operator_strings = this.operator_exprs.map(
            (expr, index) => this.editable_operator_text_at(index));
        const operand_strings = this.operand_exprs.map(
            expr => expr.as_editable_string());
        if(operator_strings.some(s => s === null) ||
           operand_strings.some(s => s === null))
            return null;
        // Interleave the operand and operator pieces.
        let pieces = [operand_strings[0]];
        for(let i = 0; i < operator_strings.length; i++) {
            pieces.push(operator_strings[i]);
            pieces.push(operand_strings[i+1]);
        }
        return pieces.join('');   
    }

    evaluate() {
        let value = this.operand_exprs[0].evaluate();
        if(value === null) return null;
        for(let i = 0; i < this.operator_exprs.length; i++) {
            const rhs = this.operand_exprs[i+1].evaluate();
            if(rhs === null) return null;
            value = this._evaluate_with_operator(
                this.operator_text(this.operator_exprs[i]),
                value, rhs);
            if(value === null) return null;
        }
        return value;
    }

    _evaluate_with_operator(op, left, right) {
        switch(op) {
        case '+': return left+right;
        case '-': return left-right;
        case 'cdot': return left*right;
        case 'times': return left*right;
        case '/': return left/right;
        default: return null;
        }
    }
}


// Represents a "placeholder marker" that can be used with the 'substitute_placeholder' command.
class PlaceholderExpr extends Expr {
    expr_type() { return 'placeholder'; }
    json_keys() { return []; }

    emit_latex(emitter) {
        const expr = new CommandExpr('htmlClass', [
            new TextExpr('placeholder_expr'), new TextExpr("\\blacksquare")]);
        emitter.expr(expr, null);
    }
}


// Represents a snippet of LaTeX code; these are the "leaves" of Expr-trees.
class TextExpr extends Expr {
    static blank() { return new TextExpr(''); }
    
    constructor(text) {
        super();
        this.text = text;
    }

    expr_type() { return 'text'; }
    json_keys() { return ['text']; }

    emit_latex(emitter) { emitter.text(this.text, null); }

    looks_like_number() {
        // cf. TextExprParser.tokenize()
        return /^-?\d*\.?\d+$/.test(this.text);
    }

    as_editable_string() {
        if(this.looks_like_number() ||
           /^\w+$/.test(this.text) ||
           this.text === '!')
            return this.text;
        else
            return null;
    }

    // TODO: check for cases like '3/4' (that's about it I think)
    evaluate() {
        const s = this.text;
        // check for constant \pi
        if(s === "\\pi") return Math.PI;
        const val = parseFloat(s);
        if(isNaN(val))
            return null;
        else
            return val;
    }
}


// Represents a sequence of expressions all concatenated together.
// Adjacent SequenceExprs can be merged together; see Expr.combine_pair().
// If 'fused' is true, this will not be combined with other adjacent
// sequences in Expr.combine_pair(), etc.
// This can be used to group things that functionally belong together
// like f(x), which matters for 'dissect' mode.
class SequenceExpr extends Expr {
    constructor(exprs, fused) {
        super();
        this.exprs = exprs;
        this.fused = !!fused;
    }

    expr_type() { return 'sequence'; }
    json_keys() { return ['exprs']; }

    to_json() {
        let json = super.to_json();
        if(this.fused) json.fused = true;
        return json;
    }

    emit_latex(emitter) {
        if(this.exprs.length === 2 &&
           this.exprs[1].expr_type() === 'delimiter') {
            // Special case: Two-element "fused" SequenceExprs of the form
            // [Expr, DelimiterExpr] automatically wrap the DelimiterExpr in an "empty"
            // latex command (i.e., set of braces).
            // For example: f(x) is [TextExpr('f'), DelimiterExpr('(', 'x', ')')]
            // so this becomes f{(x)} instead of f(x).  This has the effect of tightening
            // the spacing after f to better match normal function notation.
            emitter.expr(this.exprs[0], 0);
            emitter.grouped_expr(this.exprs[1], 'force', 1);
        }
        else
            this.exprs.forEach((expr, index) => emitter.expr(expr, index));
    }

    visit(fn) {
        fn(this);
        this.exprs.forEach(expr => expr.visit(fn));
    }

    subexpressions() { return this.exprs; }

    replace_subexpression(index, new_expr) {
        return new SequenceExpr(
            this.exprs.map(
                (subexpr, subexpr_index) => subexpr_index === index ? new_expr : subexpr));
    }

    substitute_expr(old_expr, new_expr) {
        if(this === old_expr) return new_expr;
        return new SequenceExpr(
            this.exprs.map(expr => expr.substitute_expr(old_expr, new_expr)));
    }

    as_editable_string() {
        let pieces = this.exprs.map(expr => expr.as_editable_string());
        // Special case: ['-', Expr]
        if(pieces.length === 2 &&
           this.exprs[0].expr_type() === 'text' && this.exprs[0].text === '-')
            pieces[0] = '-';  // just hack it into the list
        if(pieces.every(s => s !== null))
            return pieces.join('');
        else
            return null;
    }

    evaluate() {
        // Check for ['-', Expr] and ['+', Expr]
        if(this.exprs.length >= 2 &&
           this.exprs[0].expr_type() === 'text') {
            let factor = null;
            if(this.exprs[0].text === '+') factor = 1;
            else if(this.exprs[0].text === '-') factor = -1;
            if(factor !== null)
                return factor*(new SequenceExpr(this.exprs.slice(1), this.fused).evaluate());
        }
        // Consider anything else as implicit multiplications,
        // with special-casing for '!' factorial notation.
        let value = this.exprs[0].evaluate();
        if(value === null) return null;
        for(let i = 1; i < this.exprs.length; i++) {
            // Check for factorial
            if(this.exprs[i].expr_type() === 'text' && this.exprs[i].text === '!')
                value = this._factorial(value);
            else {
                const rhs = this.exprs[i].evaluate();
                if(rhs === null) return null;
                value *= rhs;
            }
            if(isNaN(value)) return null;
        }
        return value;
    }

    _factorial(n) {
        if(n <= 1) return 1;
        if(n > 20) return NaN;
        let value = 1;
        for(let i = 2; i <= n; i++)
            value *= i;
        return value;
    }
}


// Represents an expression enclosed in (flexible) left/right delimiters.
// e.g. \left( ... \right)
// If the enclosed expression is an InfixExpr, this attempts to convert
// infix operators to their flex-size equivalent if they have one.
class DelimiterExpr extends Expr {
    static parenthesize(expr) {
        // Special case: if expr itself is a DelimiterExpr with "blank" delimiters,
        // just replace the blanks with parentheses instead of re-wrapping expr.
        if(expr.expr_type() === 'delimiter' &&
           expr.left_type === '.' && expr.right_type === '.')
            return new DelimiterExpr('(', ')', expr.inner_expr);
        return new DelimiterExpr('(', ')', expr);
    }

    // Parenthesize 'expr' only if it's a low-precedence InfixExpr like 'x+y'.
    static autoparenthesize(expr) {
        if(expr.expr_type() === 'infix' && expr.needs_autoparenthesization())
            return DelimiterExpr.parenthesize(expr);
        else
            return expr;
    }

    // Parenthesize 'expr' if it's any kind of InfixExpr,
    // or a fraction (a full \frac{}-style fraction or a
    // "flex size" one like \left. x/y \right.).
    static parenthesize_infix_or_frac(expr) {
        const needs_parenthesization = (
            // \frac{x}{y}
            (expr.expr_type() === 'command' &&
             expr.command_name === 'frac' &&
             expr.operand_count() === 2) ||

            // any infix expression
            (expr.expr_type() === 'infix') ||
            
            // \left. x/y \right.
            // (x/y is an InfixExpr); this is a "flex size fraction".
            // TODO: add is_flex_inline_fraction() or something; this
            // logic is duplicated elsewhere.
            (expr.expr_type() === 'delimiter' &&
             expr.left_type === '.' && expr.right_type === '.' &&
             expr.inner_expr.expr_type() === 'infix' &&
             expr.inner_expr.is_binary_operator_with('/'))
        );
        if(needs_parenthesization)
            return DelimiterExpr.parenthesize(expr);
        else
            return expr;
    }
    
    constructor(left_type, right_type, inner_expr, fixed_size) {
        super();
        this.left_type = left_type;
        this.right_type = right_type;
        this.inner_expr = inner_expr;
        this.fixed_size = fixed_size || false;
    }

    expr_type() { return 'delimiter'; }
    json_keys() { return ['left_type', 'right_type', 'inner_expr']; }

    emit_latex(emitter) {
        if(this.fixed_size)
            this.emit_latex_fixed_size(emitter);
        else
            this.emit_latex_flex_size(emitter);
    }

    emit_latex_flex_size(emitter) {
        emitter.command('left');
        emitter.text_or_command(this.left_type);
        emitter.expr(this.inner_expr, 0, true);  // true: inside_delimiters
        emitter.command('right');
        emitter.text_or_command(this.right_type);
    }

    emit_latex_fixed_size(emitter) {
        if(this.left_type !== '.')
            emitter.text_or_command(this.left_type);
        emitter.expr(this.inner_expr, 0);
        if(this.right_type !== '.')
            emitter.text_or_command(this.right_type);
    }

    // Return a copy of this expression but with the given fixed_size flag.
    as_fixed_size(fixed_size) {
        return new DelimiterExpr(
            this.left_type,
            this.right_type,
            this.inner_expr,
            fixed_size);
    }

    to_json() {
        let json = super.to_json();
        if(this.fixed_size) json.fixed_size = true;
        return json;
    }

    visit(fn) {
        fn(this);
        this.inner_expr.visit(fn);
    }

    has_subexpressions() { return true; }

    subexpressions() { return [this.inner_expr]; }

    replace_subexpression(index, new_expr) {
        return new DelimiterExpr(
            this.left_type,
            this.right_type,
            new_expr,
            this.fixed_size);
    }

    substitute_expr(old_expr, new_expr) {
        if(this === old_expr) return new_expr;
        return new DelimiterExpr(
            this.left_type,
            this.right_type,
            this.inner_expr.substitute_expr(old_expr, new_expr),
            this.fixed_size);
    }

    as_editable_string() {
        const inner_string = this.inner_expr.as_editable_string();
        if(!inner_string) return null;
        let [left, right] = [null, null];
        if(this.left_type === "\\{" && this.right_type === "\\}")
            [left, right] = ['{', '}'];
        else if(this.left_type === "[" && this.right_type === "]")
            [left, right] = ['[', ']'];
        else if(this.left_type === "(" && this.right_type === ")")
            [left, right] = ['(', ')'];
        if(left && right)
            return [left, inner_string, right].join('');
        else
            return null;
    }

    evaluate() {
        return this.inner_expr.evaluate();
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
            emitter.expr(this.base_expr, 0);
        else
            emitter.grouped_expr(this.base_expr, false, 0);
        let subexpr_index = 1;
        if(this.superscript_expr) {
            emitter.text('^');
            emitter.grouped_expr(this.superscript_expr, 'force_commands', subexpr_index);
            subexpr_index++;
        }
        if(this.subscript_expr) {
            emitter.text('_');
            // 'force_commands' ensures that single LaTeX commands are still grouped, even
            // though single-letter super/subscripts are still OK to leave ungrouped.
            // e.g.: x^{\sum} instead of x^\sum, but x^2 is fine.
            emitter.grouped_expr(this.subscript_expr, 'force_commands', subexpr_index);
            subexpr_index++;  // not strictly needed
        }
    }

    visit(fn) {
        fn(this);
        this.base_expr.visit(fn);
        if(this.subscript_expr) this.subscript_expr.visit(fn);
        if(this.superscript_expr) this.superscript_expr.visit(fn);
    }

    subexpressions() {
        let exprs = [this.base_expr];
        if(this.superscript_expr) exprs.push(this.superscript_expr);
        if(this.subscript_expr) exprs.push(this.subscript_expr);
        return exprs;
    }

    // NOTE: the meaning of 'index' may vary depending on whether sub/superscript is populated.
    replace_subexpression(index, new_expr) {
        return new SubscriptSuperscriptExpr(
            index === 0 ? new_expr : this.base_expr,
            (index === 2 || (!this.superscript_expr && index === 1)) ? new_expr : this.subscript_expr,
            (index === 1 && this.superscript_expr) ? new_expr : this.superscript_expr);
    }

    substitute_expr(old_expr, new_expr) {
        if(this === old_expr) return new_expr;
        return new SubscriptSuperscriptExpr(
            this.base_expr.substitute_expr(old_expr, new_expr),
            this.subscript_expr ? this.subscript_expr.substitute_expr(old_expr, new_expr) : null,
            this.superscript_expr ? this.superscript_expr.substitute_expr(old_expr, new_expr) : null);
    }

    evaluate() {
        // Anything with a subscript can't be evaluated.
        if(this.subscript_expr || !this.superscript_expr) return null;
        const base_expr = this.base_expr;
        const s_expr = this.superscript_expr;

        // Check for e^x notation created by [/][e].
        if(base_expr.expr_type() === 'command' &&
           base_expr.command_name === 'mathrm' &&
           base_expr.operand_count() === 1 &&
           base_expr.operand_exprs[0].expr_type() === 'text' &&
           base_expr.operand_exprs[0].text === 'e') {
            const exponent_value = s_expr.evaluate();
            if(!exponent_value) return null;
            const value = Math.exp(exponent_value);
            if(isNaN(value))
                return null;
            else
                return value;
        }

        const base_value = base_expr.evaluate();

        // Check for "degrees" notation.
        if(base_value !== null &&
           s_expr.expr_type() === 'command' &&
           s_expr.operand_count() === 0 &&
           s_expr.command_name === 'circ') {
            const radians = base_value * Math.PI / 180.0;
            return radians;
        }

        // Assume it's a regular x^y power expression.
        const exponent_value = s_expr.evaluate();
        const value = Math.pow(base_value, exponent_value);
        if(isNaN(value))
            return null;
        else
            return value;
    }
}


// \begin{bmatrix} ... etc
// Currently supported "array types" are:
//   matrices: bmatrix, Bmatrix, matrix, pmatrix, vmatrix, Vmatrix
//   non-matrices (alignment environments): gathered, gather, cases, rcases, substack
class ArrayExpr extends Expr {
    // Stack two ArrayExprs on top of each other.
    // If there is an incompatibility such as mismatched column counts, null is returned.
    static stack_arrays(expr1, expr2) {
        if(expr1.column_count !== expr2.column_count)
            return null;
        return new ArrayExpr(
            expr2.array_type,
            expr1.row_count + expr2.row_count,
            expr1.column_count,
            expr1.element_exprs.concat(expr2.element_exprs),
            expr1.row_separators.concat([null], expr2.row_separators),
            expr2.column_separators);
    }
    
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
            if(expr.expr_type() === 'infix') {
                // Left side will be the left "side" of the infix at its split_at_index point.
                // Right side will be the right "side", but we have to insert a new initial "fake"
                // blank operand to give it the right structure.
                return [
                    expr.extract_side_at(expr.split_at_index, 'left'),
                    InfixExpr.combine_infix(
                        TextExpr.blank(),
                        expr.extract_side_at(expr.split_at_index, 'right'),
                        expr.operator_exprs[expr.split_at_index])];
            }
            else
                return [expr, null];
        case 'colon':
            if(expr.expr_type() === 'infix' && expr.operator_text() === ':')
                return [
                    expr.extract_side_at(expr.split_at_index, 'left'),
                    expr.extract_side_at(expr.split_at_index, 'right')];
            else
                return [expr, null];
        case 'colon_if':
            if(expr.expr_type() === 'infix' && expr.operator_text() === ':')
                return [
                    expr.extract_side_at(expr.split_at_index, 'left'),
                    Expr.combine_pair(
                        Expr.combine_pair(
                            new CommandExpr('mathrm', [new TextExpr('if')]),
                            new CommandExpr('enspace'), []),
                        expr.extract_side_at(expr.split_at_index, 'right'))];
            else return [
                expr,
                new CommandExpr('mathrm', [new TextExpr('otherwise')])];
        default:
            return [expr];
        }
    }

    // element_exprs is a nested array of length 'row_count', each of which is
    // an array of 'column_count' Exprs.
    // row_separators and column_separators can either be null or an array of N-1
    // items (where N is the row or column count respectively).  Each item can be
    // one of: [null, 'solid', 'dashed'] indicating the type of separator to put
    // between the corresponding row or column.
    constructor(array_type, row_count, column_count, element_exprs,
                row_separators, column_separators) {
        super();
        this.array_type = array_type;
        this.row_count = row_count;
        this.column_count = column_count;
        this.element_exprs = element_exprs;
        this.row_separators = row_separators || new Array(row_count-1).fill(null);
        this.column_separators = column_separators || new Array(column_count-1).fill(null);
    }

    expr_type() { return 'array'; }
    json_keys() { return ['array_type', 'row_count', 'column_count']; }

    is_matrix() {
        const t = this.array_type;
        // TODO: t.endsWith('matrix')?
        return (t === 'bmatrix' || t === 'Bmatrix' || t === 'matrix' ||
                t === 'pmatrix' || t === 'vmatrix' || t === 'Vmatrix');
    }

    // Return a copy of this expression but with a different array_type (e.g. 'pmatrix').
    // is_matrix() should be true before calling this.
    with_array_type(new_array_type) {
        return new ArrayExpr(
            new_array_type, this.row_count, this.column_count,
            this.element_exprs, this.row_separators, this.column_separators);
    }

    as_bold() {
        return new ArrayExpr(
            this.array_type,
            this.row_count,
            this.column_count,
            this.element_exprs.map(row_exprs => row_exprs.map(expr => expr.as_bold())),
            this.row_separators,
            this.column_separators);
    }

    to_json() {
        let json = super.to_json();
        json.element_exprs = this.element_exprs.map(
            row_exprs => row_exprs.map(expr => expr.to_json()));
        // Don't emit row/column separators if they are all turned off (to keep the JSON smaller).
        if(!this.row_separators.every(s => s === null))
            json.row_separators = this.row_separators;
        if(!this.column_separators.every(s => s === null))
            json.column_separators = this.column_separators;
        return json;
    }

    // Return a new ArrayExpr like this one, but with ellipses inserted before the
    // last row and column, and along the diagonal.
    // NOTE: is_matrix() should be true before calling this.
    // NOTE: this does not preserve column/row separators.  There's not really a
    // consistent way of doing this automatically.
    with_ellipses() {
        const make_cell = content => new TextExpr(content);
        let new_row_count = this.row_count, new_column_count = this.column_count;
        let new_element_exprs;
        if(this.column_count > 1) {
            new_element_exprs = this.element_exprs.map((row_exprs, index) => [
                ...row_exprs.slice(0, -1),
                make_cell((index === 0 || index === this.row_count-1) ? "\\cdots" : ''),
                row_exprs[this.column_count-1]
            ]);
            new_column_count++;
        }
        else
            new_element_exprs = [...this.element_exprs];
        if(this.row_count > 1) {
            let inserted_row_exprs = [make_cell("\\vdots")];
            for(let i = 0; i < this.column_count-2; i++)
                inserted_row_exprs.push(make_cell(''));
            if(this.column_count > 1)
                inserted_row_exprs.push(make_cell("\\ddots"), make_cell("\\vdots"));
            new_element_exprs.splice(this.row_count-1, 0, inserted_row_exprs);
            new_row_count++;
        }
        // TODO: preserve row/column separators
        return new ArrayExpr(this.array_type, new_row_count, new_column_count, new_element_exprs);
    }

    // Return a new ArrayExpr with rows and columns interchanged.
    // NOTE: is_matrix() should be true before calling this.
    transposed() {
        let new_element_exprs = [];
        for(let i = 0; i < this.column_count; i++)
            new_element_exprs.push(this.element_exprs.map(
                row_exprs => this._transpose_cell(row_exprs[i])));
        return new ArrayExpr(
            this.array_type, this.column_count, this.row_count, new_element_exprs,
            this.column_separators, this.row_separators);
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
    split_rows() {
        return this.element_exprs.map(
            row_exprs => new ArrayExpr(
                this.array_type, 1, this.column_count, [row_exprs],
                this.column_separators, null));
    }

    // Return a copy with a changed row or column separator at the specified location.
    // 'index'=0 means right after the first row or column.
    // 'index'=null means apply separators to ALL rows or columns.
    // 'type' is one of: [null, 'solid', 'dashed'].
    // If 'toggle' is true, that indicates that if the current separator is already
    // of the requested type, the separator will be turned off instead.
    with_separator(is_column, index, type, toggle) {
        const row_separators = [...this.row_separators];
        const column_separators = [...this.column_separators];
        const separators = is_column ? column_separators : row_separators;
        const size = is_column ? this.column_count : this.row_count;
        if(index === null) {
            if(toggle && separators.every(s => s === type))
                type = null;
            for(let i = 0; i < size-1; i++)
                separators[i] = type;
        }
        else {
            if(index < 0 || index >= size-1)
                return this;  // out of bounds
            if(toggle && separators[index] === type)
                type = null;
            separators[index] = type;
        }
        return new ArrayExpr(
            this.array_type, this.row_count, this.column_count, this.element_exprs,
            row_separators, column_separators);
    }

    emit_latex(emitter) {
        // Matrices with row or column separators require special handling in LaTeX.
        if(this.is_matrix() &&
           !(this.column_separators.every(s => s === null) &&
             this.row_separators.every(s => s === null)))
            return this._emit_array_with_separators(emitter);
        let subexpr_index = 0;
        if(this.array_type === 'substack')  // substack is a special case here
            emitter.text("\\substack{\n");
        else
            emitter.begin_environment(this.array_type);
        this.element_exprs.forEach((row_exprs, row_index) => {
            if(row_index > 0)
                emitter.row_separator();
            row_exprs.forEach((expr, col_index) => {
                if(col_index > 0) emitter.align_separator();
                if(expr) emitter.expr(expr, subexpr_index);  // should always be true
                subexpr_index++;
            });
        });
        if(this.array_type === 'substack')
            emitter.text("}");
        else
            emitter.end_environment(this.array_type);
    }

    // This is a matrix with at least one column separator specified.
    // Unfortunately, with LaTeX/KaTeX, the {array} environment has to be used
    // which doesn't support the surrounding matrix delimiters, so we have to
    // explicitly put out the delimiters here.  But this also throws off the matrix
    // spacing - \kern is used to compensate for that.  But the spacing after \kern
    // is too small to accomodate horizontal rules (row separators) so if those are
    // present, the (default) larger spacing is used.
    _emit_array_with_separators(emitter) {
        // Determine which delimiters to explicitly emit based on the matrix type.
        let left_delim = null, right_delim = null;
        switch(this.array_type) {
        case 'bmatrix': left_delim = '['; right_delim = ']'; break;
        case 'Bmatrix': left_delim = "\\{"; right_delim = "\\}"; break;
        case 'matrix': left_delim = null; right_delim = null; break;
        case 'pmatrix': left_delim = '('; right_delim = ')'; break;
        case 'vmatrix': left_delim = right_delim = '|'; break;
        case 'Vmatrix': left_delim = right_delim = "\\Vert"; break;
        default: break;
        }

        // Assemble the LaTeX column separator "specification" string
        // (the {c:c:c} part in: \begin{array}{c:c:c}).
        let pieces = ['{'];
        for(let i = 0; i < this.column_count; i++) {
            pieces.push('c');  // centered (only mode that's supported currently)
            if(i < this.column_count-1) {
                const s = this.column_separators[i];
                if(s === 'solid') pieces.push('|');
                else if(s === 'dashed') pieces.push(':');
            }
        }
        pieces.push('}');
        const column_layout_string = pieces.join('');

        if(left_delim) {
            emitter.command('left');
            emitter.text_or_command(left_delim);
        }
        const has_row_separators = !this.row_separators.every(s => s === null);
        if(!has_row_separators)
            emitter.text_or_command("\\kern-5pt");
        emitter.begin_environment('array', column_layout_string);
        let subexpr_index = 0;
        this.element_exprs.forEach((row_exprs, row_index) => {
            if(row_index > 0) {
                emitter.row_separator();
                const separator = this.row_separators[row_index-1];
                if(separator) {
                    if(separator === 'solid') emitter.command('hline')
                    else if(separator === 'dashed') emitter.command('hdashline');
                    emitter.text("\n");
                }
            }
            row_exprs.forEach((expr, col_index) => {
                if(col_index > 0) emitter.align_separator();
                if(expr) emitter.expr(expr, subexpr_index);  // should always be true
                subexpr_index++;
            });
        });
        emitter.end_environment('array');
        if(!has_row_separators)
            emitter.text_or_command("\\kern-5pt");
        if(right_delim) {
            emitter.command('right');
            emitter.text_or_command(right_delim);
        }
    }

    visit(fn) {
        fn(this);
        this.element_exprs.forEach(
            row_exprs => row_exprs.forEach(expr => expr.visit(fn)));
    }

    subexpressions() {
        // Flatten element expressions in row-major order.
        return [].concat(...this.element_exprs);
    }

    replace_subexpression(index, new_expr) {
        const column = index % this.column_count;
        const row = Math.floor((index - column) / this.column_count);  // floor() is not strictly needed
        const new_element_exprs = this.element_exprs.map(
            (row_exprs, row_index) => row_exprs.map(
                (expr, col_index) => (row_index === row && col_index === column) ? new_expr : expr));
        return new ArrayExpr(
            this.array_type, this.row_count, this.column_count, new_element_exprs,
            this.row_separators, this.column_separators);
    }

    substitute_expr(old_expr, new_expr) {
        if(this === old_expr) return new_expr;
        const new_element_exprs = this.element_exprs.map(
            row_exprs => row_exprs.map(
                expr => expr.substitute_expr(old_expr, new_expr)));
        return new ArrayExpr(
            this.array_type, this.row_count, this.column_count, new_element_exprs,
            this.row_separators, this.column_separators);
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
                json.tag_string || null);
        case 'text':
            return new TextItem(
                json.elements.map(element_json => TextItemElement.from_json(element_json)),
                json.tag_string || null,
                !!json.is_heading);
        case 'code':
            return new CodeItem(json.language, json.source);
        default:
            return TextItem.from_string('invalid item type ' + json.item_type);
        }
    }

    // 'tag_string' is an optional tag shown to the right of the item.
    constructor(tag_string) {
        this.serial = Item.next_serial();
        this.tag_string = tag_string;
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
    // 'selected_expr_path' is an optional ExprPath object; the indicated subexpression(s)
    //     will be highlighted in a "selected" style by the renderer.
    constructor(expr, tag_string, selected_expr_path) {
        super(tag_string)
        this.expr = expr;
        this.selected_expr_path = selected_expr_path;
    }

    item_type() { return 'expr'; }

    to_latex() {
        return this.expr.to_latex(this.selected_expr_path);
    }
    
    to_json() {
        let json = {item_type: 'expr', expr: this.expr.to_json()};
        if(this.tag_string) json.tag_string = this.tag_string;
        return json;
    }

    to_text() { return this.expr.to_text(); }
    clone() { return new ExprItem(this.expr, this.tag_string); }
    as_bold() { return new ExprItem(this.expr.as_bold(), this.tag_string); }
    with_tag(new_tag_string) { return new ExprItem(this.expr, new_tag_string); }
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
    // Within a \text{...}, bold and italic are switched on and off
    // via \bf{}, \it{}, and \rm{} commands.
    // Currently bold and italic at once is not supported.
    constructor(text, is_bold, is_italic) {
        super();
        this.text = text;
        this.is_bold = !!is_bold;
        this.is_italic = !!is_italic;
    }

    is_text() { return true; }
    as_bold() { return new TextItemTextElement(this.text, true); }

    to_json() {
        let json = { 'text': this.text };
        if(this.is_bold) json.is_bold = true;
        if(this.is_italic) json.is_italic = true;
        return json;
    }

    to_text() {
        if(this.is_bold)
            return ['**', this.text, '**'].join('');
        else if(this.is_italic)
            return ['//', this.text, '//'].join('');
        else
            return this.text;
    }

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
            if(this.is_bold)
                pieces.push("\\textbf{");
            else if(this.is_italic)
                pieces.push("\\textit{");
            else
                pieces.push("\\text{");
            pieces.push(this._latex_escape(tokens[i]));
            if(i < tokens.length-1)
                pieces.push(' ');  // preserve spacing between words
            pieces.push("}\\allowbreak ");
        }
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

class TextItemExprElement extends TextItemElement {
    constructor(expr) { super(); this.expr = expr; }
    is_expr() { return true; }
    as_bold() { return new TextItemExprElement(this.expr.as_bold()); }
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
    as_bold() { return this; }
    to_json() { return { 'raw': this.string }; }
    to_text() { return this.string; }
    to_latex() { return this.string; }
    is_explicit_space() { return this.string === "\\,"; }
}


class TextItem extends Item {
    static from_expr(expr) { return new TextItem([new TextItemExprElement(expr)]); }
    static from_string(string) { return new TextItem([new TextItemTextElement(string)]); }

    // "Separators" are currently implemented as empty TextItems with is_heading=true.
    // cf. TextItem.is_empty()
    static separator_item() { return new TextItem([], null, true); }

    // "Parse" a string which may or may not contain certain escape sequences:
    //    [] - converts into a TextItemExprElement wrapping a PlaceholderExpr
    //    **bold text** - converts into a bolded TextItemTextElement
    //    //italic text// - converts into an italic TextItemTextElement
    // The result is returned as an array of TextItemElement subclass instances.
    static parse_string(s) {
        // First handle [] placeholders.
        // Note that we don't allow bold/italic to straddle []'s, for example
        // "text **text [] text** text" will drop the bolding.
        const pieces = s.split('[]');
        let elements = [];
        // Handle **bold** within each piece between []'s.
        for(let i = 0; i < pieces.length; i++) {
            const pieces2 = pieces[i].split('**');
            for(let j = 0; j < pieces2.length; j++) {
                // Every odd-index piece2 is to be bolded; but if the total number of pieces
                // is even that means there is an unpaired **, so that last odd piece stays unbolded.
                const is_bold = (j % 2 === 1) && (j < pieces2.length-1);
                if(pieces2[j].length > 0) {
                    // Handle //italic// within each of these sub-pieces using similar logic,
                    // but only if the sub-piece is not already bolded (can't be both at once).
                    if(is_bold)
                        elements.push(new TextItemTextElement(pieces2[j], is_bold));
                    else {
                        const pieces3 = pieces2[j].split('//');
                        for(let k = 0; k < pieces3.length; k++) {
                            const is_italic = (k % 2 === 1) && (k < pieces3.length-1);
                            if(pieces3[k].length > 0)
                                elements.push(new TextItemTextElement(pieces3[k], false, is_italic));
                        }
                    }
                }
            }
            if(i < pieces.length-1)
                elements.push(new TextItemExprElement(new PlaceholderExpr()));
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
        //   - Adjacent TextElements are concatenated directly as long as their
        //     is_bold and is_italic flags match.
        //   - A RawElement representing an explicit space character (\,) is absorbed into an
        //     adjacent TextElement as a normal space character (this is to make the spacing
        //     less weird when attaching a text and expression via an infix space).
        let merged_elements = [elements[0]];
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
            else if(last_merged_element.is_raw() && last_merged_element.is_explicit_space() &&
                    elements[i].is_text()) {
                // raw space + TextElement
                merged_elements[last_index] = new TextItemTextElement(
                    ' ' + elements[i].text,
                    elements[i].is_bold, elements[i].is_italic);
            }
            else if(last_merged_element.is_text() &&
                    elements[i].is_raw() && elements[i].is_explicit_space()) {
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
        return new TextItem(merged_elements, item1.is_heading || item2.is_heading);
    }

    constructor(elements, tag_string, is_heading) {
        super(tag_string);
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
        if(this.tag_string) json.tag_string = this.tag_string;
        return json;
    }

    // Empty TextItems are displayed as "separator lines" (visually, the underlined part
    // of an ordinary section header).  Currently empty TextItems can only be created by
    // the ['][=] command, and they are always created with is_heading=true.
    // There is a slight corner case here if is_header flag is turned off via [/]["].
    // That case "should" display as a truly empty item, but for now we avoid this by
    // just disallowing turning off the is_header flag in [/]["] (do_toggle_is_heading).
    is_empty() { return this.elements.length === 0; }

    to_text() {
        if(this.is_empty())
            return "\\rule";
        else
            return this.elements.map(element => element.to_text()).join('');
    }
    
    to_latex() { return this.elements.map(element => element.to_latex()).join(''); }

    clone() { return new TextItem(this.elements, this.is_heading); }

    // If this TextItem is simple enough, return a string representation suitable
    // for editing using the minieditor.  "Simple enough" currently means that there
    // are no Exprs mixed into the text, with the exception of PlaceholderExprs which are
    // rendered as [].  Bold flags are stripped from the text as well.
    // If this TextItem is not simple, null is returned indicating that it's
    // "uneditable" with the minieditor.
    as_editable_string() {
        let pieces = [];
        for(let i = 0; i < this.elements.length; i++) {
            const elt = this.elements[i];
            if(elt.is_text())
                pieces.push(elt.to_text());
            else if(elt.is_raw()) {
                // Only basic "explicit spaces" are allowed; otherwise it's
                // probably a LaTeX command.
                if(elt.is_explicit_space())
                    pieces.push(' ');
                else return null;
            }
            else if(elt.is_expr()) {
                // Only top-level PlaceholderExprs are allowed.
                if(elt.expr.expr_type() === 'placeholder')
                    pieces.push('[]');
                else return null;
            }
        }
        return pieces.join('');
    }

    // Return a clone of this with all elements bolded.
    as_bold() {
        return new TextItem(
            this.elements.map(element => element.as_bold()),
            this.is_heading);
    }

    with_tag(new_tag_string) {
        return new TextItem(this.elements, new_tag_string, this.is_heading);
    }

    // If there is any PlaceholderExpr among the elements in this TextItem, substitute
    // the first one for substitution_expr and return the new TextItem.
    // If there are no PlaceholderExprs available, return null.
    try_substitute_placeholder(substitution_expr) {
        let new_elements = [...this.elements];
        for(let i = 0; i < new_elements.length; i++) {
            if(new_elements[i].is_expr()) {
                const placeholder_expr = new_elements[i].expr.find_placeholder();
                if(placeholder_expr) {
                    const new_expr = new_elements[i].expr.substitute_expr(placeholder_expr, substitution_expr);
                    new_elements[i] = new TextItemExprElement(new_expr);
                    return new TextItem(new_elements, this.is_heading);
                }
            }
        }
        return null;
    }
}


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

    to_latex() { return '???'; }

    clone() { return new CodeItem(this.language, this.source); }

    as_bold() { return this.clone(); }
}


// NOTE: All stack operations return a new Stack with the modified
// items, leaving the original untouched.
class Stack {
    static from_json(json) {
        return new Stack(
            json.items.map(item_json => Item.from_json(item_json)));
    }
    
    constructor(items) { this.items = items; }

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

    // Like pop(n) but all the items have to be ExprItems, and the wrapped Expr
    // instances are returned, not the ExprItems.
    pop_exprs(n) {
        if(!this.check(n)) this.underflow();
        if(!this.check_exprs(n)) this.type_error();
        const [new_stack, ...items] = this._unchecked_pop(n);
        return [new_stack, ...items.map(item => item.expr)];
    }

    pop_arrays(n) {
        const [new_stack, ...exprs] = this.pop_exprs(n);
        if(exprs.every(expr => expr.expr_type() === 'array'))
            return [new_stack, ...exprs];
        else this.type_error();
    }

    pop_matrices(n) {
        const [new_stack, ...array_exprs] = this.pop_arrays(n);
        if(array_exprs.every(expr => expr.is_matrix()))
            return [new_stack, ...array_exprs];
        else this.type_error();
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
    clone_all_items() { return new Stack(this.items.map(item => item.clone())); }

    underflow() { throw new Error('stack_underflow'); }
    type_error() { throw new Error('stack_type_error'); }

    to_json() {
        return {
            object_type: 'stack',
            items: this.items.map(item => item.to_json())
        };
    }
}


// NOTE: Like Stack, all Document operations are non-destructive and return a new
// Document reflecting the changes.
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
    Keymap, Settings, AppState, UndoStack,
    DocumentStorage, ImportExportState, FileManagerState,
    ExprPath, TextExprParser, Expr, CommandExpr, InfixExpr, PlaceholderExpr, TextExpr, SequenceExpr,
    DelimiterExpr, SubscriptSuperscriptExpr, ArrayExpr,
    Item, ExprItem, TextItem, CodeItem,
    Stack, Document
};

