

import './katex.css';  // Must be imported before App.css
import './App.css';

import React from 'react';
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

  // Export (download) a single file as .json
  start_exporting_filename(filename) {
    this.state.document_storage.load_state(
      filename,
      this.file_load_for_export_finished.bind(this),
      this.file_load_error.bind(this));
  }

  file_load_for_export_finished(filename, app_state) {
    // Download the app_state by converting it to a JSON blob,
    // creating a fake temporary link with the blob data,
    // then "clicking" on the link.
    const json = app_state.to_json();
    const export_blob = new Blob(
      [JSON.stringify(json)],
      {type: 'application/json'});
    const blob_url = URL.createObjectURL(export_blob);
    const download_link = document.createElement('a');
    download_link.download = filename + '.json';
    download_link.href = blob_url;
    download_link.style.display = 'none';
    document.body.appendChild(download_link);
    download_link.click();
    document.body.removeChild(download_link);
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
    window.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.request_file_list();
  }

  apply_layout_to_dom() {
    const settings = this.state.settings;

    /* Set up color filter / theme CSS classes. */
    let body_classes = [];
    if(settings.filter === 'inverse_video') body_classes.push('inverse_video');
    if(settings.filter === 'sepia') body_classes.push('sepia');
    if(settings.eink_mode) body_classes.push('eink_mode');
    if(settings.hide_mouse_cursor) body_classes.push('hide_mouse_cursor');
    document.getElementById('body').className = body_classes.join(' ');

    /* Set up stack position classes.  Currently these are only used to
       create a solid border between stack and document in E-ink mode. */
    const stack_panel = document.getElementById('stack_panel');
    const document_panel = document.getElementById('document_panel');
    stack_panel.classList.remove('stack_on_bottom');
    stack_panel.classList.remove('stack_on_right');
    document_panel.classList.remove('stack_on_top');
    document_panel.classList.remove('stack_on_left');
    switch(settings.layout.stack_side) {
    case 'top': document_panel.classList.add('stack_on_top'); break;
    case 'bottom': stack_panel.classList.add('stack_on_bottom'); break;
    case 'left': document_panel.classList.add('stack_on_left'); break;
    case 'right': stack_panel.classList.add('stack_on_right'); break;
    }
    
    if(this.stack_panel_ref.current && this.document_panel_ref.current &&
       this.popup_panel_ref.current) {
      this.state.settings.apply_layout_to_dom(
        this.stack_panel_ref.current,
        this.document_panel_ref.current,
        this.popup_panel_ref.current);
    }
    this.dock_helptext(this.state.settings.dock_helptext);
  }

  dock_helptext(is_docked) {
    const helptext_elt = document.getElementById('helptext');
    const help_dest_elt = is_docked ?
          document.getElementById('document_container') :
          document.getElementById('help_content');
    if(helptext_elt && helptext_elt.parentNode !== help_dest_elt) {
      helptext_elt.parentNode.removeChild(helptext_elt);
      help_dest_elt.appendChild(helptext_elt);
    }
  }

  componentDidUpdate() {
    // Show the currently opened file in the browser's document title.
    const filename = this.state.file_manager_state.current_filename;
    const new_title = '[' + (filename || 'rpnlatex') + ']';
    if(new_title !== document.title)
      document.title = new_title;
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('visibilitychange', this.handleVisibilityChange);
    //      window.removeEventListener('pageshow', this.handleVisibilityChange);
    //      window.removeEventListener('focus', this.handleVisibilityChange);
  }

  render() {
    const app_state = this.state.app_state;
    const stack = app_state.stack;
    const settings = this.state.settings;
    const input_context = this.state.input_context;

    this.stack_panel_ref = React.createRef();
    this.document_panel_ref = React.createRef();
    this.popup_panel_ref = React.createRef();

    let stack_panel_components = [];
    // TODO: floating item and mode indicator could go inside StackItemsComponent instead
    if(stack.floating_item) {
      // NOTE: To handle automatic re-rendering when things like inline-math mode
      // are changed, the ItemComponent here is put into an array by itself as a
      // React component list.  When the display mode changes, the Item is cloned,
      // getting a new React key to trigger the re-render.  Outside of a component
      // list, the React key change would have no effect.
      stack_panel_components.push(
        $e('div', {className: 'floating_item'},
           [$e(ItemComponent, {
             item: stack.floating_item,
             inline_math: settings.layout.inline_math,
             item_ref: React.createRef(),
             key: stack.floating_item.react_key(0)
           })]));
    }
    if(settings.show_mode_indicator || input_context.notification_text)
      stack_panel_components.push(
        $e(ModeIndicatorComponent, {
          app_state: app_state,
          input_context: input_context
        }));
    if(input_context.error_message)
      stack_panel_components.push(
        $e(ErrorMessageComponent, {
          app_state: app_state,
          error_message: input_context.error_message.message,
          offending_expr: input_context.offending_expr
        }));
    stack_panel_components.push(
      $e(StackItemsComponent, {
        settings: settings,
        stack: stack,
        input_context: input_context
      }));

    let document_component = null;
    if(!settings.dock_helptext)
      document_component = $e(DocumentComponent, {
        settings: settings,
        document: app_state.document,
        filename: this.state.file_manager_state.current_filename,
        is_dirty: app_state.is_dirty  /* TODO: revisit, maybe remove this */
      });

    return $e(
      'div', {id: 'panel_layout'},
      $e('div', {className: 'panel stack_panel', id: 'stack_panel', ref: this.stack_panel_ref},
         ...stack_panel_components),
      $e('div', {className: 'panel document_panel', id: 'document_panel', ref: this.document_panel_ref},
         $e('div', {
           id: 'document_container',
           className: settings.dock_helptext ? 'help' : null
         }, document_component)),
      $e(PopupPanelComponent, {
        app: this,
        settings: settings,
        popup_panel_ref: this.popup_panel_ref,
        import_export_state: this.state.import_export_state,
        document_storage: this.state.document_storage,
        file_manager_state: this.state.file_manager_state
      }));
  }

  handleKeyDown(event) {
    // No Alt key combinations are handled.
    // Meta key combinations are aliased to the Ctrl commands to
    // support things like Cmd-Z on MacOS.
    if(event.altKey)
      return;
    const key = this._keyname_from_event(event);
    // Pass through Alt+3, etc. to avoid interfering with browser tab
    // switching shortcuts.  Ctrl+digit is still allowed.
    if(event.metaKey && /^\d$/.test(event.key))
      return;
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
    if(event.shiftKey &&
       (key.startsWith('Arrow') || key === 'Enter' || key === 'Backspace'))
      key = 'Shift+' + key;
    if(event.ctrlKey || event.metaKey)
      key = 'Ctrl+' + key;
    // NOTE: none of the Alt stuff works on Firefox for some reason.  Chromium seems ok.
    // if(event.metaKey || event.altKey || event.getModifierState('Alt') || event.getModifierState('Meta'))
    //     key = 'Alt+' + key;
    return key;
  }

  handleVisibilityChange(event) {
    // Try to auto-save when the app is being "hidden" or closed.
    // This 'visibilitychange' event is used in preference to the
    // unreliable 'beforeunload' event.
    if(document.visibilityState === 'hidden' && this.state.app_state.is_dirty) {
      const filename = this.state.file_manager_state.current_filename;
      if(filename) this.state.document_storage.save_state(this.state.app_state, filename);
    }
    // On iOS Safari (and maybe others), the scroll positions may be reset when
    // the app becomes visible again, but a re-render takes care of that via
    // DocumentComponent.ensure_selection_visible().
    if(document.visibilityState === 'visible')
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


// Shows current input mode in top-right corner of stack display.
class ModeIndicatorComponent extends React.Component {
  render() {
    const input_context = this.props.input_context;
    let indicator_item = undefined;
    const notification_text = input_context.notification_text;
    let input_mode = input_context.mode;
    // Show current prefix argument (if there is one) in mode indicator.
    if(input_mode === 'build_matrix') {
      // Special case: build_matrix mode has already received a prefix
      // argument with the number of rows.  The current prefix argument
      // will become the number of columns.
      input_mode = [
        input_mode, '(',
        input_context.matrix_row_count, 'x',
        input_context.prefix_argument > 0 ? input_context.prefix_argument.toString() : '',
        ')'
      ].join('');
    }
    else if(input_context.prefix_argument !== null)
      input_mode = [
        input_mode, '(',
        (input_context.prefix_argument < 0 ? '*' : input_context.prefix_argument.toString()),
        ')'
      ].join('');
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


class ErrorMessageComponent extends React.Component {
  // TODO: show offending_expr
  render() {
    const error_message = this.props.error_message;
    const offending_expr = this.props.offending_expr;
    return $e(
      'div', {className: 'error_message'},
      error_message);
  }
}


class StackItemsComponent extends React.Component {
  render() {
    const input_context = this.props.input_context;
    const layout = this.props.settings.layout;
    const item_components = this.props.stack.items.map((item, index) => {
      // If there's an active prefix argument for stack commands, highlight the
      // corresponding stack item(s) that will (probably) be affected.
      const highlighted = this.should_highlight_item_index(this.props.stack.items.length-index);
      return $e(
        ItemComponent, {
          item: item,
          highlighted: highlighted,
          inline_math: layout.inline_math,
          item_ref: React.createRef(),
          key: item.react_key(index)
        });
    });
    if(input_context.text_entry) {
      const component = $e(
        TextEntryComponent, {
          text: input_context.text_entry.current_text,
          cursor_position: input_context.text_entry.cursor_position,
          error_start: null,
          error_end: null,
          entry_type: input_context.text_entry.mode,
          key: 'textentry'
        });
      item_components.push(component);
    }
    let class_names = ['stack_items'];
    // NOTE: can't have inline_math and rightalign_math both at once currently
    if(layout.stack_rightalign_math && !layout.inline_math)
      class_names.push('rightalign_math');
    return $e('div', {className: class_names.join(' ')}, item_components);
  }

  // Determine if the given stack item index should be "highlighted" with the
  // current mode and prefix argument.  Here, 'index' is 1-based from the
  // user's point of view: index=1 is the stack top, index=2 is the next stack
  // item, etc.  The actual stack.items list internally is reversed from this
  // (i.e. the stack top is stored at the end of the list).
  // 'prefix_argument' = 0 means no prefix argument is entered.
  // 'prefix_argument' < 0 means apply to the entire stack (using '*').
  // 'prefix_argument' >= 1 corresponds to the 1-based stack indexes.
  should_highlight_item_index(index) {
    const prefix_argument = this.props.input_context.prefix_argument;
    const mode = this.props.input_context.mode;
    if(mode === 'stack' || mode === 'array') {
      if(prefix_argument < 0)
        return true;  // highlight all items
      else
        return prefix_argument === index;
    }
    else if(mode === 'build_matrix') {
      // In build_matrix mode, the number of matrix rows to build has already
      // been selected from 'array' mode and stored in the input_context.
      // The current prefix_argument (if any) indicates the number of columns.
      // The "effective" prefix_argument is then the product of these.
      // Note that 'select all' (*) isn't allowed in build_matrix mode.
      // If no column count has been entered yet, treat it as if it were 1
      // (so that the highlight stays as it was before build_matrix mode was
      // entered).
      const column_count = prefix_argument <= 0 ? 1 : prefix_argument;
      return this.props.input_context.matrix_row_count * column_count === index;
    }
    else
      return false;
  }
}


class DocumentComponent extends React.Component {
  render() {
    this.selected_item_ref = null;
    const document = this.props.document;
    const selection_index = document.selection_index;
    const layout = this.props.settings.layout;
    const subcomponents = document.items.map((item, index) => {
      const item_ref = React.createRef();
      const is_selected = selection_index === index+1;
      if(is_selected)
        this.selected_item_ref = item_ref;
      return $e(
        ItemComponent, {
          item: item,
          selected: is_selected,
          inline_math: layout.inline_math,
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
    const spacer_ref = React.createRef();
    const top_is_selected = selection_index === 0;
    if(top_is_selected)
      this.selected_item_ref = spacer_ref;
    const top_spacer = $e(
      'div', {
        className: 'top_spacer' + (top_is_selected ? ' selected' : ''),
        key: 'top_spacer',
        ref: spacer_ref
      });
    
    let class_names = ['document_items'];
    // NOTE: can't have inline_math and rightalign_math both at once currently
    if(layout.document_rightalign_math && !layout.inline_math)
      class_names.push('rightalign_math');
    return $e(
      'div', {className: class_names.join(' ')},
      [top_spacer].concat(subcomponents));
  }

  componentDidUpdate() {
    this.ensure_selection_visible();
  }

  ensure_selection_visible() {
    if(!this.selected_item_ref) return;
    const item = this.selected_item_ref.current;
    if(!item) return;

    // Use the nonstandard scrollIntoViewIfNeeded method if available.
    // (Chrome has this, but not Firefox)
    if(item.scrollIntoViewIfNeeded)
      item.scrollIntoViewIfNeeded(false /* centerIfNeeded, i.e. don't recenter */);
    else {
      let container = document.getElementById('document_container');
      const extra_space = item.offsetHeight/2;
      if(item.offsetTop < container.scrollTop)
        container.scrollTop = item.offsetTop - extra_space;
      if(item.offsetTop + item.offsetHeight > container.scrollTop + container.offsetHeight)
        container.scrollTop = item.offsetTop + item.offsetHeight - container.offsetHeight + extra_space;
    }
  }
}


// Accumulate a single line of text for literal or Latex command entry.
class TextEntryComponent extends React.Component {
  render() {
    const class_name = 'text_entry ' + this.props.entry_type + '_mode';
    const [cursor_pos, error_start, error_end] =
          [this.props.cursor_position, this.props.error_start, this.props.error_end];
    let s = this.props.text;
    if(this.props.cursor_position === s.length)
      s += ' ';  // so that we can show the cursor when it's at the end of the text
    const spans = [];
    for(let i = 0; i < s.length; i++) {
      const is_cursor = i == cursor_pos;
      const is_error = error_start !== null && error_end !== null &&
            i >= error_start && i < error_end;
      const span_class_name =
            is_cursor && is_error ? 'cursor_character error_character' :
            is_cursor ? 'cursor_character' :
            is_error ? 'error_character' : 'normal_character';
      spans.push($e('span', {className: span_class_name}, s.slice(i, i+1)));
    }
    return $e('div', {className: class_name}, ...spans);
  }
}


class FileManagerComponent extends React.Component {
  render() {
    const show_import_export = !this.props.file_manager_state.unavailable;
    this.file_input_ref = React.createRef();
    this.json_file_input_ref = React.createRef();
    return $e(
      'div', {className: 'file_header', id: 'files_panel'},
      $e('h2', {}, 'File Manager'),
      this.render_current_filename(),
      this.render_file_table(),
      this.render_shortcuts(),
      show_import_export && $e('h2', {}, 'Export/Import'),
      show_import_export && this.render_export_import_section()
    );
  }

  render_export_import_section() {
    const import_export_state = this.props.import_export_state;
    const subcomponents = [
      $e('p', {}, 'Upload (import) a single .json document:'),
      $e('p', {},
         $e('input', {
           type: 'file',
           ref: this.json_file_input_ref
         }),
         $e('input', {
           type: 'button',
           value: 'Upload',
           onClick: this.handle_json_file_upload.bind(this)
         })),
      $e(
        'p', {},
        'Import or export all documents as a .zip file:'),
      $e('p', {}, $e('strong', {}, import_export_state.textual_state()))
    ];
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
           $e('span', {}, 'Upload zip file: '),
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

  render_current_filename() {
    const current_filename = this.props.file_manager_state.current_filename;
    if(!current_filename) return null;
    return $e(
      'div', {className: 'current_file'},
      $e('label', {}, 'Current file:'),
      $e('span', {className: 'filename'}, current_filename));
  }

  render_file_table() {
    const file_manager_state = this.props.file_manager_state;
    if(file_manager_state.unavailable)
      return $e('p', {}, 'IndexedDB support unavailable in your browser.  You will be unable to save or load documents.  Note that IndexedDB may be disabled when in Private Browsing mode.');
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
    const keybinding = key => $e('span', {className: 'keybinding'}, key);
    const helptext = text => $e('span', {}, text);
    const helpline = items => {
      // Interleave spaces between each item.
      let pieces = [];
      let first = true;
      items.forEach(item => {
        if(!first) pieces.push($e('span', {}, ' '));
        first = false;
        pieces.push(item)
      });
      return $e('li', {}, ...pieces);
    }
    const current_filename = this.props.file_manager_state.current_filename;
    const keyhelp_elements = [
      helpline([keybinding('Esc'), helptext('or'), keybinding('q'), helptext('Close file manager')]),
      helpline([keybinding("\u2191"), keybinding("\u2193"), helptext('Select next/previous file')]),
      helpline([keybinding('j'), keybinding('k'), helptext('Scroll this panel down or up')]),
      helpline([keybinding('Enter'), helptext('Open selected file')]),
      helpline([keybinding('x'), helptext('Export selected file as JSON')]),
      helpline([keybinding('d'), helptext('Delete selected file')]),
      helpline([keybinding('n'), helptext('Start a new empty file')]),
      helpline([keybinding('s'), helptext('Save current file'),
                helptext(current_filename ? ('(' + current_filename + ')') : '')]),
      helpline([keybinding('S'), helptext('Save as...')])
    ];
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

  handle_json_file_upload(event) {
    const file_input_elt = this.json_file_input_ref.current;
    if(!file_input_elt) return;
    const file_list = [...file_input_elt.files];
    if(file_list.length === 0)
      alert('Please select a .json file to import.');
    if(!file_list.every(file => file.name.endsWith('.json')))
      alert('Files must have a .json extension.');
    for(let i = 0; i < file_list.length; i++)
      this.import_json_file(file_list[i]);
  }

  import_json_file(file) {
    if(!file.name.endsWith('.json')) return;  // should be always true
    const filename = file.name.slice(0, file.name.length-5);
    file.text().then(json => {
      this.props.import_export_state.import_json_file(filename, json);
      this.props.app.request_file_list();
    });
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
// Props: {item: Item, selected: Bool, highlighted: Bool}
class ItemComponent extends React.Component {
  render() {
    const item = this.props.item;
    const item_ref = this.props.item_ref;  // references the top-level (outer) item div
    let className = this.props.selected ? 'selected ' :
        (this.props.highlighted ? 'highlighted ' : '');
    if(item.is_text_item() && item.is_heading)
      className = 'heading_style ' + className;
    const tag_element = item.tag_string ?
          $e('div', {className: 'tag_string'}, item.tag_string) : null;
    switch(item.item_type()) {
    case 'expr':
      this.katex_ref = React.createRef();  // KaTeX rendering target node
      return $e(
        'div', {className: 'item expr_item', ref: item_ref},
        tag_element,
        $e('div', {className: className + 'latex_fragment', ref: this.katex_ref}, ''));
    case 'text':
      if(item.is_empty()) {
        // Empty TextItems are rendered as separator lines as a special case.
        return $e(
          'div', {className: className + 'item separator_item', ref: item_ref},
          tag_element,
          $e('hr', {}));
      }
      else {
        // TODO: The CSS/markup for heading texts is a little hacky
        this.katex_ref = React.createRef();
        return $e(
          'div', {className: 'item text_item', ref: item_ref},
          tag_element,
          $e('div', {className: className + 'latex_fragment'},
             $e('div', {className: 'latex_fragment_inner', ref: this.katex_ref}, '')));
      }
    case 'code':
      if(item.language === 'latex') {
        // Non-rendered raw LaTeX source code.
        return $e(
          'div', {className: className + 'item latex_source_item', ref: item_ref},
          tag_element,  // not currently allowed
          $e('div', {className: 'latex_source'}, item.source));
      }
      else return $e(
        'div', {className: 'item', ref: item_ref},
        'Unknown code language: ' + item.language);
    default:
      return $e(
        'div', {className: 'item', ref: item_ref},
        'Unknown item type: ' + item.item_type());
    }
  }

  componentDidMount() {
    const item = this.props.item;
    const katex_target_node = this.katex_ref ? this.katex_ref.current : null;
    if(!katex_target_node)
      return;
    if(item.is_expr_item()) {
      // Render math with KaTeX.
      this._render_with_katex(
        item.to_latex(false),
        katex_target_node,
        !this.props.inline_math);
    }
    else if(item.is_text_item()) {
      // TextItems are always rendered in inline mode.
      // Note that this means that text items will always be left-aligned regardless
      // of the rightalign_math layout settings.
      this._render_with_katex(
        item.to_latex(false),
        katex_target_node,
        false);
    }
  }

  _render_with_katex(latex_code, node, display_mode) {
    // Check for empty/blank latex expressions - fake it with something so that it's visible.
    if(latex_code === '' || latex_code === '{}')
      latex_code = "\\llbracket\\mathsf{blank}\\rrbracket";
    else if(latex_code === "\\,")
      latex_code = "\\llbracket\\mathsf{space}\\rrbracket";
    try {
      // NOTE: trust: true here allows the use of \htmlClass etc.
      katex.render(latex_code, node, {
        throwOnError: true,
        displayMode: display_mode,
        fleqn: true,
        trust: true,
        strict: false,
        minRuleThickness: 0.06  // 0.04 default is too thin (but unfortunately this makes the sqrt bars too thick too)
      });
    }
    catch(e) {
      // Add KaTeX error message and the offending latex source to the latex_fragment node.
      // This will override the item bar's color to be red to indicate the error.
      let msg = null;
      if(e instanceof katex.ParseError) {
        // NOTE: KaTeX throws actual errors for some inputs, even if throwOnError is false.
        // Example: \texttt{\textbf{test}}
        // Generally though, these errors result from [\][\] latex text entry
        // with invalid latex commands (or [Tab][V]).
        msg = e.rawMessage;
      }
      else msg = e.toString();
      const latex_source_elt = document.createElement('div');
      latex_source_elt.className = 'latex_source_with_error';
      latex_source_elt.appendChild(document.createTextNode(latex_code));
      node.appendChild(latex_source_elt);
      const error_message_elt = document.createElement('div');
      error_message_elt.className = 'latex_error_message';
      error_message_elt.appendChild(document.createTextNode(msg));
      node.appendChild(error_message_elt);
    }
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
          app: this.props.app,
          import_export_state: this.props.import_export_state,
          document_storage: this.props.document_storage,
          file_manager_state: this.props.file_manager_state
        }));
    }
    return $e(
      'div', {id: 'popup_panel', ref: this.props.popup_panel_ref},
      subcomponent,
      $e('div', {id: 'help_container', ref: this.refs.help},
         $e('div', {id: 'help_content', className: 'help', ref: this.refs.help_content})));
  }

  componentDidMount() {
    const help_source_elt = document.getElementById('helptext');
    const help_dest_elt = this.refs.help_content.current;
    if(help_source_elt) {
      help_source_elt.style.display = 'block';
      this._render_helptext_latex(help_source_elt);
      this._setup_helptext_anchors(help_source_elt);
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
      // Restore helptext scroll position previously saved by 'do_toggle_popup'.
      this.props.popup_panel_ref.current.scrollTop = this.props.settings.help_scroll_top;
      this.props.settings.help_scroll_top = undefined;
    }
  }

  // Render any <code>...</code> spans in the help text with KaTeX.
  _render_helptext_latex(help_elt) {
    const code_elts = help_elt.getElementsByTagName('code');
    for(let i = 0; i < code_elts.length; i++) {
      const code_elt = code_elts[i];
      const latex_code = code_elt.textContent;
      if(latex_code)
        katex.render(latex_code, code_elt, {
          throwOnError: false,
          displayMode: false,
          trust: true,
          strict: false
        });
    }
  }

  // Set onclick handlers of internal links within the helptext
  // (i.e. <a href="#...">) so that the scrolling happens without
  // changing the URL in the address bar.  We don't want "#whatever"
  // in the address bar and adding to the URL history.
  _setup_helptext_anchors(help_elt) {
    const anchor_elts = help_elt.getElementsByTagName('a');
    for(let i = 0; i < anchor_elts.length; i++) {
      const anchor_elt = anchor_elts[i];
      const href = anchor_elt.getAttribute('href');
      if(href && href.startsWith('#'))
        anchor_elt.onclick = this._helptext_anchor_onclick.bind(anchor_elt);
    }
  }

  _helptext_anchor_onclick(event) {
    const anchor_target = this.getAttribute('href').slice(1);  // remove leading '#'
    const help_elt = document.getElementById('helptext');
    if(!help_elt) return;
    // Search for the corresponding <a name="..."> anchor and scroll to it.
    const anchor_elts = help_elt.getElementsByTagName('a');
    for(let i = 0; i < anchor_elts.length; i++) {
      const anchor_elt = anchor_elts[i];
      const name_attr = anchor_elt.getAttribute('name');
      if(name_attr && name_attr === anchor_target) {
        event.preventDefault();
        anchor_elt.scrollIntoView();
        break;
      }
    }
  }
}


export default App;
