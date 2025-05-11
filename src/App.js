

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
    let body = document.getElementById('body');
    if(this.state.settings.inverse_video)
      body.classList.add('inverse_video');
    else body.classList.remove('inverse_video');
    if(this.state.settings.eink_mode)
      body.classList.add('eink_mode');
    else body.classList.remove('eink_mode');
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
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    window.removeEventListener('visibilitychange', this.handleVisibilityChange);
    //      window.removeEventListener('pageshow', this.handleVisibilityChange);
    //      window.removeEventListener('focus', this.handleVisibilityChange);
  }

  render() {
    const app_state = this.state.app_state;
    const settings = this.state.settings;
    const input_context = this.state.input_context;

    this.stack_panel_ref = React.createRef();
    this.document_panel_ref = React.createRef();
    this.popup_panel_ref = React.createRef();

    let stack_panel_components = [
      $e(StackItemsComponent, {
        settings: settings,
        stack: app_state.stack,
        input_context: input_context
      })];
    if(settings.show_mode_indicator || input_context.notification_text)
      stack_panel_components.push(
	$e(ModeIndicatorComponent, {
	  app_state: app_state,
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
        settings: settings,
        popup_panel_ref: this.popup_panel_ref,
        import_export_state: this.state.import_export_state,
        document_storage: this.state.document_storage,
        file_manager_state: this.state.file_manager_state
      }));
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
    if(event.shiftKey &&
       (key.startsWith('Arrow') || key === 'Enter' || key === 'Backspace'))
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


class StackItemsComponent extends React.Component {
  render() {
    const input_context = this.props.input_context;
    const layout = this.props.settings.layout;
    const item_components = this.props.stack.items.map((item, index) => {
      // If there's an active prefix argument for stack commands, highlight the stack items that
      // will be affected.
      const selected = (
        input_context.mode === 'stack' &&
          (input_context.prefix_argument < 0 ||
           this.props.stack.items.length-index <= input_context.prefix_argument));
      return $e(
        ItemComponent, {
          item: item,
          selected: selected,
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
}


class DocumentComponent extends React.Component {
  render() {
    this.selected_item_ref = null;
    const document = this.props.document;
    const selection_index = document.selection_index;
    const layout = this.props.settings.layout;
    const subcomponents = document.items.map((item, index) => {
      let item_ref = React.createRef();
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
    const cursor_pos = this.props.cursor_position;
    let s = this.props.text;
    if(this.props.cursor_position === s.length)
      s += ' ';  // so that we can show the cursor when it's at the end of the text
    return $e(
      'div', {className: class_name},
      $e('span', {className: 'normal_characters'}, s.slice(0, cursor_pos)),
      $e('span', {className: 'cursored_character'}, s.slice(cursor_pos, cursor_pos+1)),
      $e('span', {className: 'normal_characters'}, s.slice(cursor_pos+1)));
  }
}


class FileManagerComponent extends React.Component {
  render() {
    const show_import_export = !this.props.file_manager_state.unavailable;
    this.file_input_ref = React.createRef();
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
      $e(
	'p', {},
	'This section lets you download the internal browser document storage as a .zip file, or restore the internal storage from a previously downloaded export.'),
      $e('p', {},
         $e('strong', {}, import_export_state.textual_state()))
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
    let ref = this.props.item_ref;  // references the top-level (outer) item div
    let className = this.props.selected ? 'selected ' : '';
    if(item.is_text_item() && item.is_heading)
      className = 'heading_style ' + className;
    let tag_element = null;
    if(item.tag_string)
      tag_element = $e('div', {className: 'tag_string'}, item.tag_string);
    switch(item.item_type()) {
    case 'expr':
      this.katex_ref = React.createRef();  // KaTeX rendering target node
      return $e(
        'div', {className: 'item expr_item', ref: ref},
        tag_element,
        $e('div', {className: className + 'latex_fragment', ref: this.katex_ref}, ''));
    case 'text':
      if(item.is_empty()) {
	// Empty TextItems are rendered as separator lines as a special case.
	return $e(
          'div', {className: className + 'item separator_item', ref: ref},
          tag_element,
          $e('hr', {ref: ref}));
      }
      else {
	// TODO: The CSS/markup for heading texts is a little hacky
	this.katex_ref = React.createRef();
	return $e(
          'div', {className: 'item text_item', ref: ref},
          tag_element,
          $e('div', {className: className + 'latex_fragment'},
             $e('div', {className: 'latex_fragment_inner', ref: this.katex_ref}, '')));
      }
    case 'code':
      if(item.language === 'latex') {
        // Non-rendered raw LaTeX source code.
	return $e(
	  'div', {className: className + 'item latex_source_item', ref: ref},
          tag_element,  // not currently allowed
	  $e('div', {className: 'latex_source'}, item.source));
      }
      else return $e('div', {className: 'item', ref: ref}, 'Unknown code language: ' + item.language);
    default:
      return $e('div', {className: 'item', ref: ref}, 'Unknown item type: ' + item.item_type());
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
	item.to_latex(),
	katex_target_node,
	!this.props.inline_math);
    }
    else if(item.is_text_item()) {
      // TextItems are always rendered in inline mode.
      // Note that this means that text items will always be left-aligned regardless
      // of the rightalign_math layout settings.
      this._render_with_katex(
	item.to_latex(),
	katex_target_node,
	false);
    }
  }

  _render_with_katex(latex_code, node, display_mode) {
    // Check for empty/blank latex expressions - fake it with something so that it's visible.
    if(latex_code === '')
      latex_code = "\\llbracket\\mathsf{blank}\\rrbracket";
    else if(latex_code === "\\,")
      latex_code = "\\llbracket\\mathsf{space}\\rrbracket";
    try {
      // NOTE: trust: true here allows the use of \htmlClass etc.
      katex.render(latex_code, node, {
	throwOnError: true, //false,
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
