

import './katex.css';  // Must be imported before App.css
import './App.css';

import React from 'react';
//import ReactDOM from 'react-dom';
import katex from 'katex';
import {
    Settings, AppState, UndoStack, DocumentStorage,
    ImportExportState, FileManagerState
} from './Models';
import InputContext from './Actions';


const $e = React.createElement;


class App extends React.Component {
    constructor(props) {
        super(props);

        // NOTE: settings are stored in the localStorage, but documents use indexedDB.
        // This is mainly because we need the settings before the indexedDB may be ready.
        let settings = Settings.load_from_local_storage();

        this.state = {
            app_state: new AppState(),
            settings: settings,
            file_manager_state: new FileManagerState(),
            import_export_state: new ImportExportState(),
            document_storage: new DocumentStorage(),
            input_context: new InputContext(this, settings),
            undo_stack: new UndoStack(),
            clipboard_items: {}
        };
        this.state.undo_stack.clear(this.state.app_state);
        this.state.import_export_state.document_storage = this.state.document_storage;
        this.state.import_export_state.onstatechange = () => this.import_export_state_changed();

        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);

        this.state.document_storage.open_database(this.on_open_database.bind(this));
    }

    // Database has been opened; request the list of documents, and try to load the last-opened file.
    on_open_database() {
        this.request_file_list();
        if(this.state.settings.last_opened_filename)
            this.start_loading_filename(this.state.settings.last_opened_filename);
        else {
            let file_manager_state = this.state.file_manager_state;
            let settings = this.state.settings;
            const filename = 'untitled';
            file_manager_state.current_filename = file_manager_state.selected_filename = filename;
            settings.last_opened_filename = filename;
            settings.save();
        }
    }

    file_manager_state_changed() {
        this.setState({file_manager_state: this.state.file_manager_state});
    }

    import_export_state_changed() {
        const import_export_state = this.state.import_export_state;
        this.setState({import_export_state: import_export_state});
        if(import_export_state.file_list_needs_update) {
            import_export_state.file_list_needs_update = false;
            this.request_file_list();
        }
    }

    // Start loading the current list of documents from the IndexedDB database.
    request_file_list() {
        this.state.document_storage.fetch_file_list(
            this.file_list_request_finished.bind(this),
            this.file_list_request_error.bind(this));
    }

    file_list_request_finished(file_list) {
        let file_manager_state = this.state.file_manager_state;
        file_manager_state.unavailable = false;
        file_manager_state.file_list = file_list;
        file_manager_state.sort_file_list('filename', true);
        this.setState({file_manager_state: file_manager_state});
    }

    file_list_request_error() {
        let file_manager_state = this.state.file_manager_state;
        file_manager_state.unavailable = true;
        this.setState({file_manager_state: file_manager_state});
    }

    start_loading_filename(filename) {
        this.state.document_storage.load_state(
            filename,
            this.file_load_finished.bind(this),
            this.file_load_error.bind(this));
    }

    file_load_finished(filename, new_app_state) {
        const file_manager_state = this.state.file_manager_state;
        const settings = this.state.settings;
        file_manager_state.selected_filename = file_manager_state.current_filename = filename;
        settings.last_opened_filename = filename;
        settings.save();
        this.setState({app_state: new_app_state, file_manager_state: file_manager_state});
        this.state.undo_stack.clear(new_app_state);
        this.state.input_context.notify('Loaded: ' + filename);
    }

    // TODO: It's not necessarily an error if the file doesn't exist,
    // but we should make sure to clear stack/document in that case
    // (same as do_start_new_file).
    file_load_error(filename, error) {
        //alert("Unable to load file \"" + filename + "\".");
    }

    componentDidMount() {
        this.apply_layout_to_dom();
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('beforeunload', this.handleBeforeUnload);
        window.addEventListener('visibilitychange', this.handleVisibilityChange);
//      window.addEventListener('pageshow', this.handleVisibilityChange);
//      window.addEventListener('focus', this.handleVisibilityChange);
        this.request_file_list();
    }

    apply_layout_to_dom() {
        if(this.stack_panel_ref.current && this.document_panel_ref.current &&
           this.popup_panel_ref.current) {
            this.state.settings.apply_layout_to_dom(
                this.stack_panel_ref.current, this.document_panel_ref.current,
                this.popup_panel_ref.current);
        }
    }

    componentDidUpdate() {
        // Show the currently opened file in the browser's document title.
        const filename = this.state.file_manager_state.current_filename;
        const program_name = 'rpnlatex';
        const new_title = filename ? (program_name + ' - ' + filename) : program_name;
        if(new_title !== document.title)
            document.title = new_title;
    }

    componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('beforeunload', this.handleBeforeUnload);
        window.removeEventListener('visibilitychange', this.handleVisibilityChange);
//      window.removeEventListener('pageshow', this.handleVisibilityChange);
//      window.removeEventListener('focus', this.handleVisibilityChange);
    }

    render() {
        let app_state = this.state.app_state;

        this.stack_panel_ref = React.createRef();
        this.document_panel_ref = React.createRef();
        this.popup_panel_ref = React.createRef();

        return $e(
            'div', {id: 'panel_layout', className: 'theme_' + this.state.settings.selected_theme},
            $e('div', {className: 'panel stack_panel', id: 'stack_panel', ref: this.stack_panel_ref},
               $e(StackItemsComponent, {
                   settings: this.state.settings,
                   stack: app_state.stack,
                   input_context: this.state.input_context
               }),
               $e(ModeIndicatorComponent, {app_state: app_state, input_context: this.state.input_context})),
            $e('div', {className: 'panel document_panel', id: 'document_panel', ref: this.document_panel_ref},
               $e('div', {id: 'document_container'},
                  $e(DocumentComponent, {
                      settings: this.state.settings,
                      document: app_state.document,
                      filename: this.state.file_manager_state.current_filename,
                      is_dirty: app_state.is_dirty  /* TODO: revisit, maybe remove this */
                  }))),
            $e(PopupPanelComponent, {
                settings: this.state.settings,
                popup_panel_ref: this.popup_panel_ref,
                import_export_state: this.state.import_export_state,
                document_storage: this.state.document_storage,
                file_manager_state: this.state.file_manager_state
            })
        );
    }

    handleKeyDown(event) {
        // No Alt/Meta key combinations are handled.
        if(event.altKey || event.metaKey)
            return;
        const key = this._keyname_from_event(event);
        if(key === 'Meta' || key === 'Ctrl+Control')
            return;
        
        let app_state = this.state.app_state;
        let [was_handled, new_app_state] = this.state.input_context.handle_key(app_state, key);
        if(was_handled) {
            event.preventDefault();
            // TODO: event.stopPropagation();
            const scratch = this.manage_undo_state(new_app_state);
            if(scratch)
                new_app_state = scratch;
            else   // undo/redo "failed"
                this.state.input_context.error_flash_stack();

            let state_updates = {app_state: new_app_state};
            if(this.state.input_context.files_changed) {
                this.request_file_list();
                state_updates.file_manager_state = this.state.file_manager_state;  // TODO: revisit
            }
            this.setState(state_updates);
        }
    }

    _keyname_from_event(event) {
        let key = event.key;

        if((key.startsWith('Arrow') || key === 'Enter' || key === 'Backspace') && event.shiftKey)
            key = 'Shift+' + key;
        if(event.ctrlKey)
            key = 'Ctrl+' + key;

        // NOTE: none of the Alt stuff works on Firefox for some reason.  Chromium seems ok.
        // if(event.metaKey || event.altKey || event.getModifierState('Alt') || event.getModifierState('Meta'))
        //     key = 'Alt+' + key;

        return key;
    }

    // Auto-save when window is being closed.
    handleBeforeUnload(event) {
        const filename = this.state.file_manager_state.current_filename;
        if(filename)
            this.state.document_storage.save_state(this.state.app_state, filename);
        return null;
    }

    // On iOS Safari, this event is triggered when resuming the tab.
    // When this happens, the scroll positions are reset, but a re-render takes care of that
    // via DocumentComponent.ensure_selection_visible().
    handleVisibilityChange(event) {
        this.setState({});  // force React to re-render
    }

    // Returns 'new' new_app_state.
    manage_undo_state(new_app_state) {
        let undo_stack = this.state.undo_stack;
        switch(this.state.input_context.perform_undo_or_redo) {
        case 'undo': return undo_stack.undo_state();
        case 'redo': return undo_stack.redo_state();
        case 'suppress': return new_app_state;  // Normal action, but don't remember undo state.
        case 'clear':
            undo_stack.clear(new_app_state);
            return new_app_state;
        default:
            // Normal action; save undo state
            undo_stack.push_state(new_app_state);
            return new_app_state;
        }
    }
}


// Shows current input mode in top-right corner of stack display
class ModeIndicatorComponent extends React.Component {
    render() {
        const input_context = this.props.input_context;
        let indicator_item = undefined;
        const notification_text = input_context.notification_text;
        let input_mode = input_context.mode;
        if(input_context.prefix_argument !== null) {
            // Show current prefix argument in mode indicator
            input_mode = [
                input_mode, '(',
                (input_context.prefix_argument < 0 ? '*' : input_context.prefix_argument.toString()), ')'
            ].join('');
        }
        // if(input_context.text_entry !== null)
        //     input_mode = 'text_entry';
        if(notification_text) {
            // Auto-highlight anything after the colon in the notification message.
            const colon = notification_text.indexOf(':');
            if(colon >= 0)
                indicator_item = $e(
                    'span', {className: 'notification'},
                    $e('span', {}, notification_text.slice(0, colon+1)),
                    $e('span', {className: 'highlighted'}, notification_text.slice(colon+1)));
            else
                indicator_item = $e('span', {className: 'notification'}, notification_text);
        }
        else if(input_mode !== 'base')
            indicator_item = $e(
                'span', {className: 'mode'},
                input_mode.replaceAll('_', ' '));
        return $e('div', {className: 'indicator'}, indicator_item);
    }
}


class StackItemsComponent extends React.Component {
    render() {
        let input_context = this.props.input_context;
        const item_components = this.props.stack.items.map((item, index) => {
            // If there's an active prefix argument for stack commands, highlight the stack items that
            // will be affected.
            let selected = (
                input_context.mode === 'stack' &&
                    (input_context.prefix_argument < 0 ||
                     this.props.stack.items.length-index <= input_context.prefix_argument));
            if(input_context.show_latex_source && index === this.props.stack.items.length-1) {
                // Show LaTeX source code for the stack top.
                return $e(
                    LaTeXSourceComponent, {
                        item: item,
                        key: item.react_key(index)
                    });
            }
            return $e(
                ItemComponent, {
                    item: item,
                    selected: selected,
                    inline_math: this.props.settings.layout.inline_math,
                    item_ref: React.createRef(),
                    key: item.react_key(index)
                });
        });
        if(input_context.text_entry !== null) {
            const component = $e(
                TextEntryComponent, {
                    text: input_context.text_entry,
                    entry_type: input_context.text_entry_mode,
                    key: 'textentry'
                });
            item_components.push(component);
        }
        let class_names = ['stack_items'];
        if(this.props.settings.layout.stack_rightalign_math)
            class_names.push('rightalign_math');
        return $e('div', {className: class_names.join(' ')}, item_components);
    }
}


class DocumentComponent extends React.Component {
    render() {
        const document = this.props.document;
        const subcomponents = document.items.map((item, index) => {
            let item_ref = React.createRef();
            const is_selected = document.selection_index === index+1;
            if(is_selected) this.selected_item_ref = item_ref;
            return $e(
                ItemComponent, {
                    item: item,
                    selected: is_selected,
                    inline_math: this.props.settings.layout.inline_math,
                    item_ref: item_ref,
                    key: item.react_key(index)
                });
        });

        // "Spacer" after the last document item.  This enables the document view to scroll
        // a little past the end so that we don't force the last document item to be flush
        // against the bottom of the screen.
        subcomponents.push(
            $e('div', {className: 'bottom_spacer', key: 'bottom_spacer'}));

        // Top of document "spacer", which is used to indicate that items are to be
        // inserted at the top of the document.  Unlike the bottom spacer, the top
        // spacer can be the current document selection.
        const top_is_selected = document.selection_index === 0;
        if(top_is_selected)
            this.selected_item_ref = React.createRef();
        const top_spacer = $e(
            'div', {
                className: 'top_spacer' + (top_is_selected ? ' selected' : ''),
                key: 'top_spacer',
                ref: top_is_selected ? this.selected_item_ref : null
            });
        
        let class_names = ['document_items'];
        if(this.props.settings.layout.document_rightalign_math)
            class_names.push('rightalign_math');
        return $e('div', {className: class_names.join(' ')},
                  [top_spacer].concat(subcomponents));
    }

    componentDidUpdate() {
        this.ensure_selection_visible();
    }

    ensure_selection_visible() {
        if(!this.selected_item_ref) return;
        const item = this.selected_item_ref.current;
        if(!item) return;
        let container = document.getElementById('document_container');
        const extra_space = item.offsetHeight/2;
        if(item.offsetTop < container.scrollTop)
            container.scrollTop = item.offsetTop - extra_space;
        if(item.offsetTop + item.offsetHeight > container.scrollTop + container.offsetHeight)
            container.scrollTop = item.offsetTop + item.offsetHeight - container.offsetHeight + extra_space;
    }
}


// Accumulate a single line of text for literal or Latex command entry
// (backslash key activates this).
class TextEntryComponent extends React.Component {
    render() {
        const class_name = 'text_entry ' + this.props.entry_type + '_mode';
        return $e('div', {className: class_name}, this.props.text);
    }
}


class FileManagerComponent extends React.Component {
    render() {
        const show_import_export = !this.props.file_manager_state.unavailable;
        this.file_input_ref = React.createRef();
        return $e(
            'div', {className: 'file_header', id: 'files_panel'},
            $e('h2', {}, 'File Manager'),
            this.render_file_table(),
            this.render_shortcuts(),
            show_import_export && $e('h2', {}, 'Export/Import'),
            show_import_export && this.render_export_import_section()
        );
    }

    render_export_import_section() {
        const import_export_state = this.props.import_export_state;
        let subcomponents = [];

        subcomponents.push(
            $e('p', {}, 'This section lets you download the internal browser document storage as a .zip file, or restore the internal storage from a previously downloaded export.'));

        subcomponents.push(
            $e('p', {},
               $e('strong', {}, import_export_state.textual_state())));

        if(import_export_state.state === 'idle')
            subcomponents.push(
                $e('p', {},
                   $e('a', {
                       href: '#',
                       onClick: this.start_exporting.bind(this)
                   }, 'Prepare Export')));
        if(import_export_state.download_available()) {
            const export_filename = import_export_state.generate_download_filename();
            subcomponents.push(
                $e('p', {},
                   $e('a', {href: import_export_state.download_url, download: export_filename},
                      'Download: ' + export_filename)));
        }

        // Show file upload element if ready to accept uploads.
        if(import_export_state.state === 'idle') {
            subcomponents.push(
                $e('p', {},
                   $e('span', {}, 'Import Zip File: '),
                   $e('input', {
                       type: 'file',
                       ref: this.file_input_ref
                   }),
                   $e('input', {
                       type: 'button',
                       value: 'Upload',
                       onClick: this.handle_file_upload.bind(this)
                   })));
        }

        // Show import results when import finished.
        if(import_export_state.state === 'idle' && import_export_state.import_result_string)
            subcomponents.push(
                $e('p', {},
                   $e('span', {style: {fontWeight: 'bold'}}, 'Import result: '),
                   $e('span', {}, import_export_state.import_result_string)));
        
        return $e('div', {}, ...subcomponents);
    }

    render_file_table() {
        const file_manager_state = this.props.file_manager_state;
        if(file_manager_state.unavailable)
            return $e('p', {}, 'IndexedDB support unavailable in your browser.  You will be unable to save or load documents.  Note that Firefox disables IndexedDB when in Private Browsing mode.');
        else if(file_manager_state.file_list && file_manager_state.file_list.length > 0) {
            return $e(
                'div', {},
                $e('table', {className: 'file_table'},
                   $e('thead', {},
                      $e('tr', {},
                         $e('th', {className: 'filename'}, 'Filename'),
                         $e('th', {className: 'filesize', colSpan: '2'}, 'Size'),
                         $e('th', {className: 'timestamp', colSpan: '2'}, 'Last Modified'))),
                   $e('tbody', {},
                      file_manager_state.file_list.map(
                          (file, index) => this._render_file_list_row(file, index)))));
        }
        else if(file_manager_state.file_list)
            return $e('p', {}, 'No files created yet.');
        else
            return $e('p', {}, 'Fetching file list...');
    }

    _render_file_list_row(file, index) {
        const file_manager_state = this.props.file_manager_state;
        let class_names = [];
        if(file.filename === file_manager_state.selected_filename) class_names.push('selected_file');
        if(file.filename === file_manager_state.current_filename) class_names.push('current_file');
        const item_count = file.document_item_count + file.stack_item_count;
        return $e(
            'tr', {className: class_names.join(' '), key: 'file_' + file.filename},
            $e('td', {className: 'filename'}, file.filename),
            $e('td', {className: 'filesize'},
               Math.floor((file.filesize+1023)/1024) + ' kb'),
            $e('td', {className: 'filesize'},
               item_count + ' object' + (item_count === 1 ? '' : 's')),
            $e('td', {className: 'timestamp'}, file.timestamp.toLocaleDateString()),
            $e('td', {className: 'timestamp'}, file.timestamp.toLocaleTimeString()));
    }

    render_shortcuts() {
        const current_filename = this.props.file_manager_state.current_filename;
        const help_specs = [
            ['Escape', 'Close file manager'],
            ['Arrows', 'Select next/previous file'],
            ['Enter', 'Open selected file'],
            ['d', 'Delete selected file'],
            ['n', 'Start a new empty file'],
            ['s', 'Save current file' + (current_filename ? (' (' + current_filename + ')') : '')],
            ['S', 'Save as...']
        ];
        const keyhelp_elements = help_specs.map(spec => {
            const [keyname, helptext] = spec;
            return $e(
                'li', {},
                $e('span', {className: 'keybinding'}, keyname),
                $e('span', {}, ' ' + helptext));
        });
        return $e('ul', {className: 'keybindings'}, ...keyhelp_elements);
    }

    handle_file_upload(event) {
        const file_input_elt = this.file_input_ref.current;
        if(!file_input_elt) return;
        const file_list = file_input_elt.files;
        if(file_list.length === 1)
            this.start_importing(file_list[0]);
        else if(file_list.length > 1)
            alert('Please select a single .zip file to import.');
        else
            alert('Please select a .zip file to import.');
    }

    start_importing(file) {
        const import_export_state = this.props.import_export_state;
        if(import_export_state.state === 'idle')
            import_export_state.start_importing(file);
    }

    start_exporting() {
        const import_export_state = this.props.import_export_state;
        if(import_export_state.state === 'idle')
            import_export_state.start_exporting();
    }
}


// Displays an Item instance in any context (stack/document).
// Props: {item: Item, selected: Bool}
class ItemComponent extends React.Component {
    render() {
        let item = this.props.item;
        let ref = this.props.item_ref;
        let className = this.props.selected ? 'selected ' : '';
        if(item.item_type() === 'text' && item.is_heading)
            className = 'heading_style ' + className;
        switch(item.item_type()) {
        case 'expr':
            if(item.tag_expr) {
                this.tag_ref = React.createRef();
                return $e(
                    'div', {className: 'expr_item'},
                    $e('div', {className: 'tag_expr', ref: this.tag_ref}, ''),
                    $e('div', {className: className + 'latex_fragment', ref: ref}, ''));
            }
            else 
                return $e(
                    'div', {className: 'expr_item'},
                    $e('div', {className: className + 'latex_fragment', ref: ref}, ''));
        case 'text':
            // TODO: The CSS/markup for heading texts is a little hacky
            return $e(
                'div', {className: 'text_item'},
                $e('div', {className: className + 'latex_fragment'},
                   $e('div', {className: 'latex_fragment_inner', ref: ref}, '')));
        case 'separator':
            return $e(
                'div', {className: className + 'separator_item'},
                $e('hr'));
        default:
            return $e('div', {}, '????');
        }
    }

    componentDidMount() {
        let item = this.props.item;
        let node = this.props.item_ref.current;
        if(!node) return;  // shouldn't happen
        if(item.item_type() === 'expr') {
            // Render math with KaTeX
            this._render_with_katex(item.expr.to_latex(), node, !this.props.inline_math);
            if(item.tag_expr && this.tag_ref.current)
                this._render_with_katex(item.tag_expr.to_latex(), this.tag_ref.current, false);
        }
        else if(item.item_type() === 'text') {
            // TextItems are always rendered in inline mode.
            // Note that this means that text items will always be left-aligned regardless
            // of the rightalign_math layout settings.
            this._render_with_katex(item.to_latex(), node, false);
        }
    }

    _render_with_katex(latex_code, node, display_mode) {
        if(latex_code === '' || latex_code === "\\,") {
            // Empty/blank latex expression - fake it with something so that it's visible.
            latex_code = "\\text{(blank)}";
        }
        try {
            // NOTE: trust: true here allows the use of \htmlClass etc.
            katex.render(
                latex_code, node,
                { throwOnError: false, displayMode: display_mode, fleqn: true, trust: true });
        }
        catch(e) {
            // KaTeX throws actual errors for some inputs, even if throwOnError is false.
            // Example: \texttt{\textbf{test}}
            const msg = e.toString();
            node.innerHTML = '<div style="color:red;">' + msg + '</div>';
        }
    }
}


class LaTeXSourceComponent extends React.Component {
    render() {
        let item = this.props.item;
        return $e(
            'div', {className: 'latex_source_item'},
            $e('div', {className: 'latex_source'}, item.to_text()));
    }
}


class PopupPanelComponent extends React.Component {
    render() {
        this.refs = {
            help: React.createRef(),
            help_content: React.createRef()
        };
        const popup_mode = this.props.settings.popup_mode;
        let subcomponent = null;
        if(popup_mode === 'files') {
            subcomponent = $e(
                'div', {id: 'files_container'},
                $e(FileManagerComponent, {
                    import_export_state: this.props.import_export_state,
                    document_storage: this.props.document_storage,
                    file_manager_state: this.props.file_manager_state
                }));
        }
        return $e(
            'div', {id: 'popup_panel', ref: this.props.popup_panel_ref},
            subcomponent,
            $e('div', {id: 'help_container', ref: this.refs.help},
               $e('div', {className: 'help', ref: this.refs.help_content})));
    }

    componentDidMount() {
        let help_source_elt = document.getElementById('helptext');
        let help_dest_elt = this.refs.help_content.current;
        if(help_source_elt) {
            help_source_elt.style.display = 'block';
            this._render_help_latex(help_source_elt);
            help_source_elt.parentNode.removeChild(help_source_elt);
            help_dest_elt.appendChild(help_source_elt);
        }
    }

    componentDidUpdate() {
        const mode = this.props.settings.popup_mode;
        if(this.refs.help.current)
            this.refs.help.current.style.display = (mode === 'help' ? 'block' : 'none');
        if(mode === 'help' &&
           this.props.settings.help_scroll_top !== undefined &&
           this.props.popup_panel_ref.current) {
            if(typeof(this.props.settings.help_scroll_top) === 'string') {
                // Jump to a specified anchor in the help text.
                window.location.hash = '#' + this.props.settings.help_scroll_top;
            }
            else {
                // Restore helptext scroll position previously saved by 'do_toggle_popup'.
                this.props.popup_panel_ref.current.scrollTop = this.props.settings.help_scroll_top;
            }
            this.props.settings.help_scroll_top = undefined;
        }
    }

    // Render any <code>...</code> spans in the help text with KaTeX.
    _render_help_latex(help_elt) {
        let children = help_elt.getElementsByTagName('code');
        for(let i = 0; i < children.length; i++) {
            let code_elt = children[i];
            const latex_code = code_elt.textContent;
            if(latex_code)
                katex.render(latex_code, code_elt,
                             { throwOnError: false, displayMode: false, trust: true });
        }
    }
}


export default App;
