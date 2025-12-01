

import './katex.css';  // Must be imported before App.css
import './App.css';

import React from 'react';
import katex from 'katex';
import {
  Settings, AppState, UndoStack, FileManager
} from './Models';
import InputContext from './Actions';


const $e = React.createElement;


class App extends React.Component {
  constructor(props) {
    super(props);
    this.stack_panel_ref = React.createRef();
    this.document_panel_ref = React.createRef();
    this.file_manager_panel_ref = React.createRef();
    this.helptext_panel_ref = React.createRef();
    let file_manager = new FileManager();
    const settings = file_manager.load_settings();
    // Start without any popups or docked helptext even if it was saved like that.
    settings.popup_mode = null;
    settings.dock_helptext = false;
    // Try to load the most recently used file on startup.
    if(settings.last_opened_filename)
      file_manager.current_filename = file_manager.selected_filename = settings.last_opened_filename;
    let app_state = null;
    if(file_manager.check_storage_availability())
      app_state = file_manager.load_file(file_manager.current_filename);
    app_state ||= new AppState();
    this.state = {
      app_state: app_state,
      settings: settings,
      file_manager: file_manager,
      input_context: new InputContext(this, settings),
      undo_stack: new UndoStack(),
      clipboard_items: {}
    };
    this.state.undo_stack.clear(this.state.app_state);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
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

  componentDidMount() {
    this.apply_layout_to_dom();
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  apply_layout_to_dom() {
    const settings = this.state.settings;

    // Set up color filter / theme CSS classes.
    let body_classes = [];
    if(settings.filter === 'inverse_video') body_classes.push('inverse_video');
    if(settings.filter === 'sepia') body_classes.push('sepia');
    if(settings.filter === 'eink') body_classes.push('eink_mode');
    if(settings.hide_mouse_cursor) body_classes.push('hide_mouse_cursor');
    document.getElementById('body').className = body_classes.join(' ');

    // Set up stack position classes.  Currently these are only used to
    // create a solid border between stack and document in E-ink mode.
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
    
    this.state.settings.apply_layout_to_dom(
      this.stack_panel_ref.current,
      this.document_panel_ref.current,
      this.file_manager_panel_ref.current,
      this.helptext_panel_ref.current);
  // this.dock_helptext(this.state.settings.dock_helptext);
  }

  // TODO
  // dock_helptext(is_docked) {
  //   const helptext_elt = document.getElementById('helptext');
  //   const help_dest_elt = is_docked ?
  //         document.getElementById('document_container') :
  //         document.getElementById('help_content');
  //   if(helptext_elt && helptext_elt.parentNode !== help_dest_elt) {
  //     helptext_elt.parentNode.removeChild(helptext_elt);
  //     help_dest_elt.appendChild(helptext_elt);
  //   }
  // }

  componentDidUpdate() {
    // Show the currently opened file in the browser's document title.
    const filename = this.state.file_manager.current_filename;
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
    const document_panel_component = $e(DocumentComponent, {
      settings: settings,
      document: app_state.document,
      filename: this.state.file_manager.current_filename,
      is_dirty: app_state.is_dirty  // TODO: revisit, maybe remove this
    });
    return $e(
      'div', {id: 'panel_layout'},
      $e('div', {
        className: 'panel stack_panel',
        id: 'stack_panel',
        ref: this.stack_panel_ref
      }, ...stack_panel_components),
      $e('div', {
        className: 'panel document_panel',
        id: 'document_panel',
        ref: this.document_panel_ref
      }, document_panel_component),
      // File Manager and User Guide panels are always present, just hidden with
      // CSS if they're not currently in use.  The user guide is repositioned
      // dynamically when "docked/undocked" in the document section.
      $e(FileManagerPanelComponent, {
        app: this,
        settings: settings,
        file_manager: this.state.file_manager,
        popup_panel_ref: this.file_manager_panel_ref
      }),
      $e(HelptextPanelComponent, {
        app: this,
        popup_panel_ref: this.helptext_panel_ref
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
    if(['Meta', 'Shift', 'Ctrl+Control', 'Ctrl+Meta'
       ].includes(key))
      return;  // ignore isolated modifier key presses
    let app_state = this.state.app_state;
    let [was_handled, new_app_state] = this.state
        .input_context.handle_key(app_state, key);
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
        // Re-render the file manager panel with the updated file list.
        state_updates.file_manager = this.state.file_manager;
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
    if(document.visibilityState === 'hidden' && this.state.app_state.is_dirty)
      this.state.file_manager.save_file(
        this.state.file_manager.current_filename,
        this.state.app_state);
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
      // Normal action; save undo state.
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
      const highlighted = this.should_highlight_item_index(
        this.props.stack.items.length-index);
      return $e(
        ItemComponent, {
          item: item,
          highlighted: highlighted,
          inline_math: layout.inline_math,
          centered: layout.stack_math_alignment === 'center',
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
          key: 'textentry'  // this is in a React list, so needs a key
        });
      item_components.push(component);
    }
    let class_names = ['stack_items'];
    // NOTE: can't have inline_math and rightalign_math both at once currently
    if(layout.stack_math_alignment === 'right' && !layout.inline_math)
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
          centered: layout.document_math_alignment === 'center',
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
    if(layout.document_math_alignment === 'right' && !layout.inline_math)
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
    const container = document.getElementById('document_panel');
    if(item.scrollIntoViewIfNeeded) {
      // scrollIntoViewIfNeeded resets the document container's horizontal scroll position
      // to zero, so it needs to be explicitly restored here.  Otherwise, left/right
      // document panel scrolling commands wouldn't work, since ensure_selection_visible()
      // is invoked after every action.
      const old_scroll_left = container.scrollLeft;
      item.scrollIntoViewIfNeeded(false /* centerIfNeeded, i.e. don't recenter */);
      container.scrollLeft = old_scroll_left;
    }
    else {
      const extra_space = item.offsetHeight/2;
      if(item.offsetTop < container.scrollTop)
        container.scrollTop = item.offsetTop - extra_space;
      if(item.offsetTop + item.offsetHeight > container.scrollTop + container.offsetHeight)
        container.scrollTop = item.offsetTop + item.offsetHeight - container.offsetHeight + extra_space;
    }
  }
}


// Accumulate a line of text for literal or Latex command entry.
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
      const is_cursor = i === cursor_pos;
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


class FileManagerPanelComponent extends React.Component {
  constructor(props) {
    super(props);
    this.file_input_ref = React.createRef();
  }
  
  render() {
    this.props.file_manager.refresh_available_files();
    return $e(
      'div', {id: 'files_panel', ref: this.props.popup_panel_ref},
      $e('div', {className: 'files_container'},
         $e('h2', {}, 'File Manager'),
         this.render_current_filename(),
         this.render_file_table(),
         this.render_storage_used(),
         this.render_shortcuts(),
         this.render_import_section()));
  }

  render_import_section() {
    const subcomponents = [
      $e('p', {}, 'Upload (import) a .rpn document:'),
      $e('p', {},
         $e('input', {
           type: 'file',
           ref: this.file_input_ref
         }),
         $e('input', {
           type: 'button',
           value: 'Upload',
           onClick: this.handle_file_upload.bind(this)
         }))];
    return $e('div', {}, ...subcomponents);
  }

  render_current_filename() {
    const current_filename = this.props.file_manager.current_filename;
    if(!current_filename) return null;
    return $e(
      'div', {className: 'current_file'},
      $e('label', {}, 'Current file:'),
      $e('span', {className: 'filename'}, current_filename));
  }

  render_file_table() {
    const file_manager = this.props.file_manager;
    if(!file_manager.check_storage_availability())
      return $e('p', {}, 'Local storage support unavailable in your browser.  You will be unable to save or load documents.');
    if(file_manager.available_files &&
       file_manager.available_files.length > 0) {
      return $e(
        'div', {},
        $e('table', {className: 'file_table'},
           $e('thead', {},
              $e('tr', {},
                 $e('th', {className: 'filename'}, 'Filename'),
                 $e('th', {className: 'filesize', colSpan: '2'}, 'Size'),
                 $e('th', {className: 'timestamp', colSpan: '2'}, 'Last Modified'))),
           $e('tbody', {},
              file_manager.available_files.map(
                (file_info, index) => this._render_file_list_row(file_info, index)))));
    }
    else
      return $e('p', {}, 'No files created yet.');
  }

  _render_file_list_row(file_info, index) {
    const file_manager = this.props.file_manager;
    let class_names = [];
    if(file_info.filename === file_manager.selected_filename)
      class_names.push('selected_file');
    if(file_info.filename === file_manager.current_filename)
      class_names.push('current_file');
    const timestamp_date = new Date(file_info.timestamp);
    return $e(
      'tr', {className: class_names.join(' '), key: 'file_' + file_info.filename},
      $e('td', {className: 'filename'}, file_info.filename),
      $e('td', {className: 'filesize'}, this._kilobytes(file_info.filesize)),
      $e('td', {className: 'filesize'},
         file_info.item_count + ' object' + (file_info.item_count === 1 ? '' : 's')),
      $e('td', {className: 'timestamp'}, timestamp_date.toLocaleDateString()),
      $e('td', {className: 'timestamp'}, timestamp_date.toLocaleTimeString()));
  }

  _kilobytes(bytes) {
    return Math.floor((bytes+1023)/1024).toString() + 'k';
  }

  render_storage_used() {
    const file_manager = this.props.file_manager;
    let pieces = [
      'Storage used:',
      this._kilobytes(file_manager.storage_used)];
    if(file_manager.storage_quota)
      pieces.push(
        'of', this._kilobytes(file_manager.storage_quota),
        '(' + Math.round(100*(
          file_manager.storage_used / file_manager.storage_quota)) + '%)');
    return $e(
      'div', {className: 'storage_used'},
      $e('span', {}, pieces.join(' ')));
  }

  render_shortcuts() {
    const keybinding = key => $e('span', {className: 'k'}, key);
    const helptext = text => $e('span', {}, text);
    const helpline = items => {
      // Interleave spaces between each item.
      let pieces = [];
      let first = true;
      for(const item of items) {
        if(!first) pieces.push($e('span', {}, ' '));
        first = false;
        pieces.push(item)
      }
      return $e('li', {}, ...pieces);
    }
    const current_filename = this.props.file_manager.current_filename;
    const keyhelp_elements = [
      helpline([keybinding('Esc'), helptext('or'), keybinding('q'), helptext('Close file manager')]),
      helpline([keybinding("\u2191"), keybinding("\u2193"), helptext('Select next/previous file')]),
      helpline([keybinding('j'), keybinding('k'), helptext('Scroll this panel down or up')]),
      helpline([keybinding('Enter'), helptext('Open selected file')]),
      helpline([keybinding('s'), helptext('Save current file'),
                helptext(current_filename ? ('(' + current_filename + ')') : '')]),
      helpline([keybinding('S'), helptext('Save as...')]),
      helpline([keybinding('n'), helptext('Start a new empty file')]),
      helpline([keybinding('x'), helptext('Export selected file as JSON')]),
      helpline([keybinding('d'), helptext('Delete selected file')]),
      helpline([keybinding('D'), helptext('Delete ALL files')])
    ];
    return $e('ul', {className: 'keybindings'}, ...keyhelp_elements);
  }

  // Needs to be an async function to await the uploaded file.text() Promises.
  async handle_file_upload(event) {
    const file_input_elt = this.file_input_ref.current;
    const file_manager = this.props.file_manager;
    if(!file_input_elt) return;
    const file_list = file_input_elt.files;
    for(let i = 0; i < file_list.length; i++) {
      let error_message = null;
      const file = file_list[i];
      const filename = file_manager.sanitize_filename(
        file.name.slice(0, file.name.length-4));
      if(!filename)
        error_message = 'invalid filename';
      else if(file.size > 5000000)
        error_message = 'file too large (limit 5MB)';
      else {
        const base64_string = await file.text();
        const imported_app_state = file_manager.
              decode_app_state_base64(base64_string);
        if(!imported_app_state)
          error_message = 'file contents are invalid';
        if(!error_message)
          file_manager.save_file(filename, imported_app_state);
      }
      if(error_message) {
        alert('Error importing ' + file.name + ': ' + error_message);
        break;  // cancel the rest if one of the imports fails
      }
    }
    file_manager.refresh_available_files();
    this.setState({});
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
        !this.props.inline_math,
        this.props.centered);
    }
    else if(item.is_text_item()) {
      // TextItems are always rendered in inline mode.
      // Note that this means that text items will always be left-aligned regardless
      // of the rightalign_math layout settings.
      this._render_with_katex(
        item.to_latex(false),
        katex_target_node,
        false,
        false);
    }
  }

  _render_with_katex(latex_code, node, display_mode, centered) {
    // Check for empty/blank latex expressions - fake it with something so that it's visible.
    if(latex_code === '' || latex_code === '{}')
      latex_code = "\\llbracket\\mathsf{blank}\\rrbracket";
    else if(latex_code === "\\,")
      latex_code = "\\llbracket\\mathsf{space}\\rrbracket";
    try {
      katex.render(latex_code, node, {
        throwOnError: true,
        displayMode: display_mode,
        fleqn: !centered,
        trust: true,  // allow the use of \htmlClass etc.
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


class HelptextPanelComponent extends React.Component {
  constructor(props) {
    super(props);
    this.help_content_ref = React.createRef();
  }
  
  render() {
    return $e(
      'div', {id: 'helptext_panel', ref: this.props.popup_panel_ref},
      $e('div', {id: 'help_container'},
         $e('div', {
           id: 'help_content',
           className: 'help',
           ref: this.help_content_ref
         })));
  }

  componentDidMount() {
    const help_source_elt =
          document.getElementById('helptext');  // User Guide base node from index.html
    const help_dest_elt = this.help_content_ref.current;
    if(help_source_elt) {
      help_source_elt.style.display = 'block';
      this._render_helptext_latex(help_source_elt);
      this._setup_helptext_anchors(help_source_elt);
      help_source_elt.parentNode.removeChild(help_source_elt);
      help_dest_elt.appendChild(help_source_elt);
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
    const dest_elt = document.getElementById(anchor_target);
    if(dest_elt) {
      event.preventDefault();
      dest_elt.scrollIntoView();
    }
  }
}


export default App;
