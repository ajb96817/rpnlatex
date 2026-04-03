
// All editor keybindings are in here (in keybinding_table).  This maps each editor
// mode to a set of keyname->command bindings.  The 'commands' are in a simple macro
// language of one or more action strings separated by semicolons.  Each action
// invokes one of the do_* methods of InputContext.  The actions can have extra
// arguments which are passed as strings to these methods.
//
// Some special pseudo-commands are available:
//   - [alpha], [digit], [alnum]: matches single letters/numbers/both
//   - [delegate]: dispatch to a different mode's keymap (like keymap inheritance)
//   - [default]: matches any input not explicitly in the keymap; [delegate] takes
//                precedence over this if present
//   - alias x: treat it as if the keystroke was 'x' instead (within the current mode)
//   - alias newmode x: treat it as keystroke 'x' within mode 'newmode'


// Utility class for translating key inputs into editor commands.
class Keymap {
  constructor() {
    this.bindings = keybinding_table;
  }

  // Convert a Javascript KeyboardEvent into a simple keyname string.
  // Return null if the key event is to be ignored (like isolated Shift
  // or Ctrl presses).  Otherwise, the returned keyname is to be used directly
  // to look up commands in the Keymap.
  // NOTE: If Shift+Ctrl are both used, the combination will be
  // 'Ctrl+Shift+A', not 'Shift+Ctrl+A'.
  keyname_from_event(event) {
    let key = event.key;
    // No Alt key combinations are handled (they don't work well cross-browser).
    // Meta key combinations are aliased to the Ctrl commands to support things
    // like Cmd-Z on MacOS.
    if(event.altKey)
      return null;
    // Pass through Alt+3, etc. to avoid interfering with browser tab
    // switching shortcuts.  Ctrl+[digit] is still allowed.
    if(event.metaKey && /^\d$/.test(key))
      return null;
    // Ignore isolated modifier keypresses.
    if(['Meta', 'Shift', 'Alt', 'Control', 'Ctrl+Control', 'Ctrl+Meta'
       ].includes(key))
      return null;
    // Shifted keys: we want Shift+ArrowLeft, etc. but not Shift+U
    // or Shift+$.  We also want to be able to handle Ctrl+Shift+[digit],
    // but for some reason some Ctrl+Shift digits are inconsistent:
    // we get Ctrl+Shift+@ for 2, but Ctrl+Shift+3 for 3, etc.
    // If using these combos in the future, need to account for this
    // (e.g. UK keyboards may have the pound sign, etc).
    if(event.shiftKey &&
       (key.startsWith('Arrow') ||
        ///^d$/.test(key) ||
        // For now, explicitly test for the key we want as Shift+Home etc.
        ['Enter', ' ', 'Backspace', 'PageUp', 'PageDown', 'Home', 'End'
        ].includes(key)))
      key = 'Shift+' + key;
    if(event.ctrlKey || event.metaKey)
      key = 'Ctrl+' + key;
    return key;
  }

  lookup_binding(mode, key, in_delegate_lookup = false) {
    const command = this._lookup_binding(mode, key, in_delegate_lookup);
    if(command && command.startsWith('alias ')) {
      let [aliased_mode, aliased_key] = command.slice(6).split(' ');
      if(!aliased_key)
        [aliased_mode, aliased_key] = [mode, aliased_mode];  // 'alias x' without mode
      return this.lookup_binding(aliased_mode, aliased_key, in_delegate_lookup);
    }
    else return command;
  }

  _lookup_binding(mode, key, in_delegate_lookup = false) {
    const mode_map = this.bindings[mode];
    if(!mode_map)
      return null;  // unknown mode; shouldn't happen
    if(mode_map[key])
      return mode_map[key];  // direct match
    if(mode_map['[alpha]'] && /^[a-zA-Z]$/.test(key))
      return mode_map['[alpha]'];
    if(mode_map['[digit]'] && /^[0-9]$/.test(key))
      return mode_map['[digit]'];
    if(mode_map['[alnum]'] && /^[a-zA-Z0-9]$/.test(key))
      return mode_map['[alnum]'];
    if(mode_map['[delegate]'] && !in_delegate_lookup) {
      const command = this.lookup_binding(
        mode_map['[delegate]'], key, true);
      if(command) return command;
      // (fall through and try [default] if not found in the delegate keymap)
    }
    if(mode_map['[default]'])
      return mode_map['[default]'];
    if(mode === 'base' || in_delegate_lookup)
      return null;
    else
      return 'cancel';
  }
}


const keybinding_table = {
  base: {
    // Letters and numbers immediately push onto the stack
    '[alnum]': "push_last_keypress",

    // Immediate action special keys
    'Escape': "config dock_helptext off",
    'Enter': "subscript",
    'Shift+Enter': "edit_item",
    'Backspace': "pop",
    'Shift+Backspace': "nip",
    
    ' ': "concat",
    'Shift+ ': "concat;concat",
    '!': "push !;concat",  // creates a PostfixExpr, see Expr.concatenate()
    '^': "superscript",
    "`": "superscript",
    '<': "infix <",
    '>': "infix >",
    '+': "infix +",
    '-': "autoparenthesize;infix -",
    '*': "autoparenthesize 2;infix \\cdot",
    ']': "make_bold",
    '[': "delimiters [ ]",
    '(': "delimiters ( )",
    '{': "delimiters \\{ \\}",

    // Document scrolling commands
    'ArrowUp': "change_document_selection -1",
    'ArrowDown': "change_document_selection +1",
    'PageUp': "change_document_selection -5",  // TODO: scroll based on viewport height instead
    'PageDown': "change_document_selection +5",
    'Home': "change_document_selection top",
    'End': "change_document_selection bottom",

    // Document selection shifting commands
    'Shift+ArrowUp': "shift_document_selection -1",
    'Shift+ArrowDown': "shift_document_selection +1",
    // TODO: Check these on all browsers/OSs; maybe use different keybindings
    'Shift+PageUp': "shift_document_selection -5",
    'Shift+PageDown': "shift_document_selection +5",
    'Shift+Home': "shift_document_selection top",
    'Shift+End': "shift_document_selection bottom",

    // Horizontal scrolling commands
    'ArrowRight': "scroll stack_panel horizontal 50",
    'ArrowLeft': "scroll stack_panel horizontal -50",
    'Shift+ArrowRight': "scroll document_panel horizontal 50",
    'Shift+ArrowLeft': "scroll document_panel horizontal -50",

    // Prefix keys
    'Tab': "mode stack",
    "'": "mode symbol",
    '.': "mode decoration",
    ',': "mode infix",
    '=': "mode relational",
    ')': "mode delimiters",
    ';': "mode greek",
    ':': "alias ;",  // for now, but may be reassigned to something else eventually
    '@': "mode calligraphic",
    '&': "mode script",
    '%': "mode blackboard",
    '/': "mode operator",
    "\\": "start_text_entry math_entry",
    "\"": "start_text_entry text_entry",
    '|': "mode array",
    '~': "mode tensor",
    '_': "start_dissect_mode",
    '#': "mode sympy",
    '$': "mode config",
    '?': "toggle_popup help",

    // Ctrl-based shortcuts
    'Ctrl+0': "alias decoration 0",
    'Ctrl+1': "alias decoration 1",
    'Ctrl+2': "alias decoration 2",
    'Ctrl+3': "alias decoration 3",
    'Ctrl+4': "alias decoration 4",
    'Ctrl+a': "alias stack a",
    'Ctrl+b': "alias base ]",
    'Ctrl+c': "alias stack c",
    'Ctrl+d': "alias base Enter",  // subscript
    'Ctrl+e': "alias operator e",  // exp(x): same as [/][e]
    'Ctrl+f': "parenthesize;push f;swap;function_call",
    'Ctrl+g': "parenthesize;push g;swap;function_call",
    'Ctrl+i': "alias stack i",
    'Ctrl+j': "alias stack j",
    'Ctrl+k': "alias operator k",
    'Ctrl+l': "alias stack l",
    'Ctrl+m': "alias decoration -",
    'Ctrl+n': "alias decoration r",
    'Ctrl+o': "alias operator o",
    'Ctrl+p': "alias base (",
    //'Ctrl+q': "unrot",
    'Ctrl+r': "alias operator r",
    'Ctrl+R': "alias operator R",
    'Ctrl+s': "alias files s",
    'Ctrl+t': "autoparenthesize;push t;parenthesize;function_call",  // y -> y(t)
    'Ctrl+u': "alias `",
    'Ctrl+v': "alias stack v",
    'Ctrl+w': "alias stack w",
    'Ctrl+W': "alias stack W",
    'Ctrl+x': "autoparenthesize;push x;parenthesize;function_call",  // f -> f(x)
    'Ctrl+y': "alias stack y",
    'Ctrl+z': "alias stack z",
    'Ctrl+ ': "alias infix s",
    'Ctrl+,': "alias infix ,",
    'Ctrl+/': "alias operator a",
    "Ctrl+\\": "alias operator 1",
    'Ctrl+]': "alias decoration b",
    'Ctrl++': "increment 1",  // NOTE: Ctrl++ not currently inputtable, but Ctrl+= works
    'Ctrl+=': "increment 1",
    'Ctrl+-': "increment -1",
    "Ctrl+'": "alias decoration '",
    "Ctrl+.": "alias decoration .",
    'Ctrl+Backspace': "alias stack n"
  },

  // File Manager mode
  files: {
    '[default]': "toggle_popup files",
    'd': "delete_selected_file",
    'D': "delete_all_files",
    'n': "start_new_file",
    'Enter': "load_selected_file",
    'x': "export_selected_file",
    's': "save_file",
    'Ctrl+s': "alias s",
    'S': "save_file_as",
    'R': "rename_selected_file",
    'ArrowUp': "select_adjacent_file -1",
    'ArrowDown': "select_adjacent_file 1",
    // TODO: PageUp/PageDown/Home/End
    'j': 'scroll files_panel vertical 25',
    'k': 'scroll files_panel vertical -25'
  },

  // User Guide mode
  help: {
    // Exit/dock user guide
    'q': "toggle_popup help",
    'Q': "alias q",
    'Escape': "alias q",
    '?': "config dock_helptext on",

    // Scrolling
    'ArrowDown': 'scroll helptext_panel vertical 25',
    'ArrowUp': 'scroll helptext_panel vertical -25',
    'j': 'alias ArrowDown',
    'k': 'alias ArrowUp',
    'ArrowLeft': 'cancel',  // 'cancel' here means don't hide the help text
    'ArrowRight': 'cancel',
    'PageDown': 'scroll helptext_panel vertical 95',
    'PageUp': 'scroll helptext_panel vertical -95',
    ' ': 'alias PageDown',
    'Ctrl+ ': 'alias PageUp',
    'J': 'alias PageDown',
    'K': 'alias PageUp',
    'Home': 'scroll helptext_panel vertical top',
    'End': 'scroll helptext_panel vertical bottom',

    // Independent zoom factor for User Guide
    '+': "config helptext_zoom_factor increase",
    '-': "config helptext_zoom_factor decrease",
    '0': "config helptext_zoom_factor reset",

    '[delegate]': "_help_jump",  // jump directly to prefix key help section
    '[default]': "toggle_popup help"  // never actually invoked
  },

  // Quick navigation to each User Guide section.
  // While the User Guide popup is visible, these can be used without
  // a prefix key.  When the User Guide is docked, they can be used with
  // the [Tab][?] prefix.
  _help_jump: {
    '&': "scroll_to help_insert_script",
    '%': "scroll_to help_insert_blackboard",
    '@': "scroll_to help_insert_calligraphic",
    "\\": "scroll_to help_math_entry",
    "\"": "scroll_to help_text_entry",
    'Backspace': "scroll_to help_prefix_keys",
    "Shift+Enter": "scroll_to help_edit_text",
    'Tab': "scroll_to help_stack",
    "'": "scroll_to help_symbols",
    '.': "scroll_to help_decorations",
    ',': "scroll_to help_infix",
    '=': "scroll_to help_relational",
    '/': "scroll_to help_operators",
    'd': "scroll_to help_derivatives",
    'D': "alias d",
    'v': "alias v",
    'i': "scroll_to help_integrals",
    'I': "alias i",
    'f': "scroll_to help_named_operators",
    ')': "scroll_to help_delimiters",
    '(': "alias )",
    '[': "alias )",
    '{': "alias )",
    '|': "scroll_to help_arrays",
    '~': "scroll_to help_tensors",
    '_': "scroll_to help_dissect",
    '#': "scroll_to help_sympy",
    ':': "scroll_to help_greek",
    ';': "alias :",
    '$': "scroll_to help_configuration",
    'c': "scroll_to help_control_keys",
    'x': "scroll_to help_examples"
  },

  // [Tab] prefix: stack/misc operations
  stack: {
    '[digit]': "prefix_argument",
    '*': "prefix_argument",
    'a': "swap",
    'c': "copy_to_clipboard",
    'd': "pop",
    'i': "pop_to_document",
    'I': "pop_to_document preserve",
    'f': "toggle_popup files",
    'j': "extract_from_document",
    'J': "extract_from_document preserve",
    'k': "keep",
    'l': "recenter_document 50",
    'n': "nip",
    'o': "over",
    'r': "rot",
    's': "save_file",
    't': "tuck",
    'u': "unrot",
    'v': "paste_from_clipboard",
    'V': "paste_from_prompt",
    'w': "push_floating_item",
    'W': "pop_floating_item",
    'X': "reset_all",
    'y': "redo",
    'z': "undo",
    'Tab': "dup",
    'Enter': "alias Tab",
    'Shift+Enter': "edit_item",
    'Backspace': "pop",
    'Shift+Backspace': "nip",
    '=': "push_separator;pop_to_document",
    '!': "export_document_as_text",
    '@': "export_stack_items_as_text",
    '$': "extract_latex_source",
    '?': "mode user_guide_jump",
    'ArrowRight': "scroll document_panel horizontal 75",
    'ArrowLeft': "scroll document_panel horizontal -75"
  },

  // [Tab][?] prefix: jump to User Guide sections while docked
  user_guide_jump: {
    '[delegate]': "_help_jump",
    // Undocumented: allow changing user guide font size while docked
    // (luckily these don't conflict with the prefix keys).
    '+': "config helptext_zoom_factor increase",
    '-': "config helptext_zoom_factor decrease",
    '0': "config helptext_zoom_factor reset"
  },

  // [$] prefix: configuration
  config: {
    '[digit]': "prefix_argument",
    '*': "prefix_argument",
    'ArrowLeft': "config stack_side left",
    'ArrowRight': "config stack_side right",
    'ArrowUp': "config stack_side top",
    'ArrowDown': "config stack_side bottom",
    'a': "config math_align stack",
    'A': "config math_align document",
    'D': "config toggle_debug_mode",  // undocumented
    'E': "config eink_mode",
    'f': "fullscreen on",
    'F': "fullscreen off",
    'i': "config toggle_inline_math",
    'I': "config toggle_mode_indicator",
    'M': "config toggle_hide_mouse_cursor",
    'R': "config reset_layout",
    's': "config stack_split",
    'S': "config sepia",
    'V': "config inverse_video",
    'z': "config zoom_factor increase",
    '+': "alias z",
    'Z': "config zoom_factor decrease",
    '-': "alias Z",
    '_': "alias Z",  // undocumented
    '!': "config reload_page",
    '(': "config autoparenthesize on",
    ')': "config autoparenthesize off",
    '~': "debug",  // debugging command hook: calls do_debug()
    '$': "push \\$"  // undocumented
  },

  // Delegate (shared) keymap for the 5 text_entry modes' editor commands.
  _editor_commands: {
    'Escape': "cancel_text_entry",
    'Ctrl+z': "alias Escape",
    'Backspace': "text_entry_backspace backspace",
    'Shift+Backspace': "alias Backspace",
    'Delete': "text_entry_backspace delete",
    'ArrowLeft': "text_entry_move_cursor left",
    'ArrowRight': "text_entry_move_cursor right",
    'Home': "text_entry_move_cursor begin",
    'End': "text_entry_move_cursor end",

    // NOTE: Ctrl editor commands here are undocumented
    'Ctrl+a': "alias Home",
    'Ctrl+ArrowLeft': "alias Home",
    'Ctrl+d': "alias Delete",
    'Ctrl+e': "alias End",
    'Ctrl+ArrowRight': "alias End",
    'Ctrl+f': "alias ArrowRight",
    'Ctrl+b': "alias ArrowLeft",
    '[default]': "append_text_entry"
  },

  // ["] prefix: text entry
  text_entry: {
    'Enter': "finish_text_entry text",
    'Shift+Enter': "finish_text_entry heading",
    '[delegate]': "_editor_commands"
  },

  // [\] prefix: math entry
  math_entry: {
    'Enter': "finish_text_entry math",
    'Shift+Enter': "finish_text_entry roman_text",
    'Tab': "finish_text_entry operatorname",
    '[delegate]': "_editor_commands"
  },

  // [\][\] prefix: latex command
  latex_entry: {
    'Enter': "finish_text_entry latex",
    'Shift+Enter': "finish_text_entry latex_unary",
    'Delete': "text_entry_backspace delete math_entry",
    'Backspace': "text_entry_backspace backspace math_entry",
    ',': "finish_text_entry latex_infix",
    '[delegate]': "_editor_commands"
  },

  // [,]['] prefix: custom conjunction
  conjunction_entry: {
    'Enter': "finish_text_entry conjunction",
    'Shift+Enter': "finish_text_entry bold_conjunction",
    '[delegate]': "_editor_commands"
  },

  // [/][;] prefix: equation tag
  tag_entry: {
    'Enter': "finish_text_entry tag",
    'Shift+Enter': "finish_text_entry tag_with_parentheses",
    '[delegate]': "_editor_commands"
  },

  // [)] prefix: special delimiters
  delimiters: {
    'b': "delimiters \\langle \\vert",  // <x| Dirac bra
    'c': "delimiters \\lceil \\rceil",
    'd': "push \\llbracket;swap;concat false;push \\rrbracket;concat false",  // NOTE: non flex size due to KaTeX limitation
    'f': "delimiters \\lfloor \\rfloor",
    'F': "toggle_fixed_size_delimiters",
    'g': "delimiters \\lgroup \\rgroup",
    'i': "infix \\,\\vert\\,;delimiters \\langle \\rangle",  // <x|y> [i]nner product
    'I': "infix \\,\\vert\\,;infix \\,\\vert\\,;delimiters \\langle \\rangle",  // <x|y|z>
    'k': "delimiters \\vert \\rangle",  // |x> Dirac ket
    'l': "mode modify_left",
    'L': "alias l",
    'm': "delimiters \\lmoustache \\rmoustache",
    'n': "delimiters \\lVert \\rVert",  // [n]orm
    'N': "alias n",
    'o': "delimiters ( ]",  // half-closed interval
    'O': "delimiters [ )",
    'r': "mode modify_right",
    'R': "alias r",
    'w': "delimiters . \\vert",  // [w]here
    'W': "alias w",
    'x': "remove_delimiters",
    'X': "alias x",
    '|': "delimiters \\vert \\vert",
    '<': "delimiters \\langle \\rangle",
    '(': "delimiters ( .",
    ')': "delimiters . )",
    '[': "delimiters [ .",
    ']': "delimiters . ]",
    '{': "delimiters \\{ .",
    '}': "delimiters . \\}",
    '.': "delimiters . .",
    ' ': "alias ."
  },

  // [)][l] prefix: change left delimiter type
  modify_left: {
    'c': "modify_delimiter \\lceil left",
    'C': "modify_delimiter \\rceil left",
    'f': "modify_delimiter \\lfloor left",
    'F': "modify_delimiter \\rfloor left",
    'g': "modify_delimiter \\lgroup left",
    'G': "modify_delimiter \\rgroup left",
    'm': "modify_delimiter \\lmoustache left",
    'M': "modify_delimiter \\rmoustache left",
    'n': "modify_delimiter \\Vert left",
    '<': "modify_delimiter \\langle left",
    '>': "modify_delimiter \\rangle left",
    '(': "modify_delimiter ( left",
    ')': "modify_delimiter ) left",
    '[': "modify_delimiter [ left",
    ']': "modify_delimiter ] left",
    '{': "modify_delimiter \\{ left",
    '}': "modify_delimiter \\} left",
    '.': "modify_delimiter . left",
    ' ': "modify_delimiter . left",
    '/': "modify_delimiter / left",
    "\\": "modify_delimiter \\backslash left",
    '|': "modify_delimiter \\vert left"
  },

  // [)][r] prefix: change left delimiter type
  modify_right: {
    'c': "modify_delimiter \\lceil right",
    'C': "modify_delimiter \\rceil right",
    'f': "modify_delimiter \\lfloor right",
    'F': "modify_delimiter \\rfloor right",
    'g': "modify_delimiter \\lgroup right",
    'G': "modify_delimiter \\rgroup right",
    'm': "modify_delimiter \\lmoustache right",
    'M': "modify_delimiter \\rmoustache right",
    'n': "modify_delimiter \\Vert right",
    '<': "modify_delimiter \\langle right",
    '>': "modify_delimiter \\rangle right",
    '(': "modify_delimiter ( right",
    ')': "modify_delimiter ) right",
    '[': "modify_delimiter [ right",
    ']': "modify_delimiter ] right",
    '{': "modify_delimiter \\{ right",
    '}': "modify_delimiter \\} right",
    '.': "modify_delimiter . right",
    ' ': "modify_delimiter . right",
    '/': "modify_delimiter / right",
    "\\": "modify_delimiter \\backslash right",
    '|': "modify_delimiter \\vert right"
  },

  // [/] prefix: assorted functions/operators
  operator: {
    '1': "integer 1;swap;fraction",
    "\\": "integer 1;swap;fraction",
    '2': "mode squared",
    'a': "fraction",
    'b': "operator binom 2",
    'c': "named_function cos",
    'C': "named_function csc",
    'd': "mode derivative",
    'D': "mode derivative_alt",
    'e': "push e;typeface roman;swap;superscript",  // e^x
    'E': "named_function exp",
    'f': "mode named_operator",
    'g': "push \\int;swap;superscript;swap;subscript",
    'h': "mode hyperbolic",
    'i': "mode integral",
    'I': "mode integral_with_limits",
    // 'j': "push i;swap;concat;push e;typeface roman;swap;superscript",  // x -> e^ix (undocumented; not sure how useful this is)
    // 'J': "push i;swap;concat;named_function exp",  // x -> exp(ix) (undocumented)
    'k': "infix \\,\\vert\\,;parenthesize;function_call",  // f x y -> f(x|y)
    'K': "unrot;infix ,;swap;infix \\,\\vert\\,;parenthesize;function_call",  // f x y z -> f(x,y|z)
    'l': "push \\limits;swap;subscript;push \\lim;swap;concat",  // lim_{x}
    'L': "infix \\to;push \\limits;swap;subscript;push \\lim;swap;concat",  // lim_{y \to x}
    'm': "parenthesize_argument;push Im;swap;operator operatorname 2",  // Im(x)
    'M': "parenthesize_argument;push Re;swap;operator operatorname 2",  // Re(x)
    'n': "named_function ln",
    'N': "named_function log",
    'o': "parenthesize;function_call",  // f x -> f(x)  "[o]f"
    'O': "swap;operator overset 2",
    'p': "parenthesize;push P;typeface blackboard;swap;function_call",  // P(X) (probability)
    'P': "infix \\,\\vert\\,;parenthesize;push P;typeface blackboard;swap;function_call",  // P(y|x)
    'q': "operator sqrt",
    'Q': "operator sqrt[3]",
    'r': "infix ,;parenthesize;function_call",  // f x y -> f(x,y)
    'R': "infix ,;infix ,;parenthesize;function_call",  // f x y z -> f(x,y,z)
    's': "named_function sin",
    'S': "named_function sec",
    't': "named_function tan",
    'T': "named_function cot",
    'u': "increment 1",
    'U': "swap;operator underset 2",
    'v': "mode variational",
    'V': "parenthesize [ ];push Var;typeface roman;swap;function_call",  // Var[x]
    'w': "swap_pieces",
    'x': "parenthesize [ ];push E;typeface blackboard;swap;function_call",  // E[x] (expectation)
    'X': "infix \\,\\vert\\,;parenthesize [ ];push E;typeface blackboard;swap;function_call",  // E[y|x]
    'y': "push E;typeface blackboard;swap;subscript;swap;parenthesize [ ];function_call",  // E_x[y] (with subscript)
    'Y': "push E;typeface blackboard;swap;subscript;unrot;infix \\,\\vert\\,;parenthesize [ ];function_call",  // E_x[z|y]
    'z': "dissolve",
    ' ': "swap;concat",
    ';': "start_text_entry tag_entry",
    ',': "infix_linebreak",
    '/': "fraction",
    '[': "parenthesize [ ];function_call",  // f x -> f[x]
    ']': "parenthesize \\{ \\};function_call",  // f x -> f{x}
    '{': "swap;operator overbrace;swap;superscript",
    '}': "swap;operator underbrace;swap;subscript",
    '<': "extract_side left",
    '>': "extract_side right",
    '!': "negate_comparison",
    '-': "mode inverse",
    '=': "unrot;infix =;push \\sum;swap;subscript;swap;superscript",
    '+': "infix \\ge;push \\sum;swap;subscript",
    '|': "swap;delimiters . \\vert;swap;subscript",  // y|_{x} ('where')
    '^': "integer 10;swap;superscript;infix \\cdot",  // scientific notation: 1.23 \cdot 10^-19
    "'": "substitute_placeholder",
    "\"": "toggle_is_heading",
    '%': "substitute",  // % is from Emacs' Esc-% search and replace command
    'Enter': "unrot;subscript;swap;superscript"  // apply superscript and subscript at once
  },

  // [/][f] prefix
  named_operator: {
    // NOTE: Only some commands autoparenthesize, depending on the
    // traditional mathematical notation of the operator.
    'a': "named_function arg",
    'c': "parenthesize [ ];push Cov;typeface roman;swap;function_call",  // Cov[x]
    'C': "infix ,;parenthesize [ ];push Cov;typeface roman;swap;function_call",  // Cov[x,y]
    'd': "named_function det",
    'D': "named_function dim",
    'e': "parenthesize;push erf;swap;operator operatorname 2",
    'E': "parenthesize;push erfc;swap;operator operatorname 2",
    'g': "infix ,;parenthesize;operator gcd",  // NOTE: no lcm(x,y) currently
    'G': "named_function deg",
    'h': "named_function hom",
    'i': "operator inf",
    'I': "operator liminf",
    'k': "named_function ker",
    'l': "operator lim",
    'm': "named_function min",
    'M': "operator argmin",
    'n': "parenthesize;push sgn;swap;operator operatorname 2",
    'p': "named_function Pr",
    'P': "infix ,;named_function Pr",  // Pr(x,y)
    's': "named_function sup",
    'S': "operator limsup",
    't': "parenthesize_argument;push Tr;swap;operator operatorname 2",
    'v': "parenthesize [ ];push Var;typeface roman;swap;function_call",  // Var[x]
    'V': "infix ,;parenthesize [ ];push Var;typeface roman;swap;function_call",  // Var[x,y]
    'x': "named_function max",
    'X': "operator argmax"
  },

  // [/][h] prefix: hyperbolic trig functions
  // TODO: maybe make a more general way of doing these
  hyperbolic: {
    's': "named_function sinh",
    'S': "named_function sech",
    'c': "named_function cosh",
    'C': "named_function csch",
    't': "named_function tanh",
    'T': "named_function coth",
    '2': "mode squared_hyperbolic",
    '-': "mode inverse_hyperbolic"
  },
  // [/][-] prefix
  inverse: {
    'u': "increment -1",  // special case: [/][-][u]: decrement
    '-': "alias u",  // (undocumented)
    '1': "alias u",  // (undocumented)
    's': "named_function sin -1",
    'S': "named_function sec -1",
    'c': "named_function cos -1",
    'C': "named_function csc -1",
    't': "named_function tan -1",
    'T': "named_function cot -1",
    'h': "mode inverse_hyperbolic",
    '2': "mode squared"
  },
  // [/][-][h] or [/][h][-] prefix
  inverse_hyperbolic: {
    's': "named_function sinh -1",
    'S': "named_function sech -1",
    'c': "named_function cosh -1",
    'C': "named_function csch -1",
    't': "named_function tanh -1",
    'T': "named_function coth -1",
    '2': "mode squared_hyperbolic"
  },
  // [/][2] prefix
  squared: {
    // NOTE: [/][2][V] (covariance) is kind of a special case
    'V': "infix ,;parenthesize [ ];push Cov;typeface roman;swap;function_call",  // Cov[x,y]
    's': "named_function sin 2",
    'S': "named_function sec 2",
    'c': "named_function cos 2",
    'C': "named_function csc 2",
    't': "named_function tan 2",
    'T': "named_function cot 2",
    'n': "named_function lg",  // [n][N] are special cases for base-2 log
    'N': "named_function log _2",
    'h': "mode squared_hyperbolic",
    '-': "mode inverse"
  },
  // [/][2][h] or [/][h][2] prefix
  squared_hyperbolic: {
    's': "named_function sinh 2",
    'S': "named_function sech 2",
    'c': "named_function cosh 2",
    'C': "named_function csch 2",
    't': "named_function tanh 2",
    'T': "named_function coth 2",
    '-': "mode inverse_hyperbolic"
  },

  // [/][i] prefix - add limits to an existing integral sign
  integral: {
    'r': "push \\infty;negate;subscript;push \\infty;superscript",  // -inf..inf : [r]eals
    'R': "push R;typeface calligraphic;subscript",  // reals alternative notation
    'n': "push \\infty;negate;subscript;integer 0;superscript",  // -inf..0 : [n]egative 
    'p': "integer 0;subscript;push \\infty;superscript",  // 0..inf : [p]ositive
    'u': "integer 0;subscript;integer 1;superscript",  // 0..1 : [u]nit
    'U': "integer -1;subscript;integer 1;superscript",  // -1..1 : symmetric [U]nit
    't': "integer 0;subscript;integer 2;push \\pi;concat;superscript",  // 0..2pi : [t]rigonometric
    'T': "push \\pi;negate;subscript;push \\pi;superscript",  // -pi..pi : symmetric [T]rigonometric
    'P': "integer 0;subscript;push \\pi;superscript"  // 0..pi
  },

  // [/][I] prefix
  // (same as /i, but create the integral sign too)
  integral_with_limits: {
    'r': "push \\int;push \\infty;negate;subscript;push \\infty;superscript",
    'R': "push \\int;push R;typeface calligraphic;subscript",
    'n': "push \\int;push \\infty;negate;subscript;integer 0;superscript",
    'p': "push \\int;integer 0;subscript;push \\infty;superscript",
    'u': "push \\int;integer 0;subscript;integer 1;superscript",
    'U': "push \\int;integer -1;subscript;integer 1;superscript",
    't': "push \\int;integer 0;subscript;integer 2;push \\pi;concat;superscript",
    'T': "push \\int;push \\pi;negate;subscript;push \\pi;superscript",
    'P': "push \\int;integer 0;subscript;push \\pi;superscript"
  },

  // [/][d] prefix: derivative operations
  derivative: {
    // \partial y / \partial x
    'j': "push \\partial;swap;concat;swap;push \\partial;swap;concat;swap;fraction",
    // \partial^2 y / \partial x^2
    'J': "integer 2;superscript;push \\partial;swap;concat;swap;push \\partial;integer 2;superscript;swap;concat;swap;fraction",
    // d/dx
    'x': "differential_form 1;differential_form 0;swap;fraction",
    // d^2 / dx^2
    'X': "integer 2;superscript;differential_form 1;differential_form 0;integer 2;superscript;swap;fraction",
    // dy/dx
    'y': "differential_form 1;swap;differential_form 1;swap;fraction",
    // d^2(y) / dx^2 (NOTE: differential_form(1) can't be used in the numerator because of the exponent)
    'Y': "integer 2;superscript;differential_form 1;swap;differential_form 0;integer 2;superscript;swap;concat;swap;fraction",
    // \partial / \partial x
    'q': "push \\partial;swap;concat;push \\partial;swap;fraction",
    // \partial^2 / \partial x^2
    'Q': "integer 2;superscript;push \\partial;swap;concat;push \\partial;integer 2;superscript;swap;fraction",
    // \partial^2 / \partial x\,\partial y
    'm': "push \\partial;swap;concat;push \\partial;rot;concat;swap;push \\,;swap;concat;concat;push \\partial;integer 2;superscript;swap;fraction",
    // \partial^2 z / \partial x\,\partial y
    'M': "push \\partial;swap;concat;push \\partial;rot;concat;swap;push \\,;swap;concat;concat;swap;push \\partial;integer 2;superscript;swap;concat;swap;fraction",
    // gradient
    'g': "push \\nabla;swap;concat",
    // gradient with respect to x
    'G': "push \\nabla;swap;subscript;swap;concat",
    // divergence
    '.': "autoparenthesize;push \\nabla;swap;infix \\cdot",
    // directional derivative operator
    '>': "autoparenthesize;push \\nabla;infix \\cdot",
    // curl
    'c': "autoparenthesize;push \\nabla;swap;infix \\times",
    // curl pullback
    'C': "autoparenthesize;push \\nabla;infix \\times",
    // Laplacian
    'l': "autoparenthesize;push \\nabla;integer 2;superscript;swap;concat",
    // Delta-x
    'n': "autoparenthesize;push \\Delta;swap;concat",  // i[n]crement (?)
    // x -> dx
    'd': "differential_form 1",
    // x -> \partial x
    'p': "push \\partial;swap;concat",
    // y x -> \partial_x y
    'P': "push \\partial;swap;subscript;swap;concat",
    // x y -> dx ^ dy
    'f': "differential_form 2",
    // x y z -> dx ^ dy ^ dz
    'F': "differential_form 3",
    // x -> d^2x
    '2': "differential_form 0;integer 2;superscript;swap;concat",
    '3': "differential_form 0;integer 3;superscript;swap;concat",
    '4': "differential_form 0;integer 4;superscript;swap;concat",
    // y x -> y dx (concatenate to integral sign)
    'i': "differential_form 1;concat",
    ' ': "alias i"
  },

  // [/][D] prefix: derivative operations, but using roman-font 'd'
  derivative_alt: {
    'd': "differential_form 1 roman",
    'D': "alias d",  // (undocumented)
    'f': "differential_form 2 roman",
    'F': "differential_form 3 roman",
    '2': "differential_form 0 roman;integer 2;superscript;swap;concat",
    '3': "differential_form 0 roman;integer 3;superscript;swap;concat",
    '4': "differential_form 0 roman;integer 4;superscript;swap;concat",
    'i': "differential_form 1 roman;concat",
    ' ': "alias i",
    'x': "differential_form 1 roman;differential_form 0 roman;swap;fraction",
    'X': "integer 2;superscript;differential_form 1 roman;differential_form 0 roman;integer 2;superscript;swap;fraction",
    'y': "differential_form 1 roman;swap;differential_form 1 roman;swap;fraction",
    'Y': "integer 2;superscript;differential_form 1 roman;swap;differential_form 0 roman;integer 2;superscript;swap;concat;swap;fraction",
    '[delegate]': "derivative"
  },

  // [/][v] prefix: functional derivatives (variational calculus)
  // (same as [/][d] commands but \partial -> \delta)
  variational: {
    'j': "push \\delta;swap;concat;swap;push \\delta;swap;concat;swap;fraction",
    'J': "integer 2;superscript;push \\delta;swap;concat;swap;push \\delta;integer 2;superscript;swap;concat;swap;fraction",
    'q': "push \\delta;swap;concat;push \\delta;swap;fraction",
    'Q': "integer 2;superscript;push \\delta;swap;concat;push \\delta;integer 2;superscript;swap;fraction",
    'm': "push \\delta;swap;concat;push \\delta;rot;concat;swap;push \\,;swap;concat;concat;push \\delta;integer 2;superscript;swap;fraction",
    'M': "push \\delta;swap;concat;push \\delta;rot;concat;swap;push \\,;swap;concat;concat;swap;push \\delta;integer 2;superscript;swap;concat;swap;fraction",
    'p': "push \\delta;swap;concat",
    'P': "push \\delta;swap;subscript;swap;concat",

    // Additional aliases for dy/dx style commands (total derivatives);
    // these will be treated as synonyms for the corresponding \partial commands.
    'x': "alias q",
    'X': "alias Q",
    'y': "alias j",
    'Y': "alias J",

    // Counterparts to ordinary differential form commands.
    'd': "push \\delta;swap;concat",
    '2': "push \\delta;integer 2;superscript;swap;concat",
    '3': "push \\delta;integer 3;superscript;swap;concat",
    '4': "push \\delta;integer 4;superscript;swap;concat",
    'i': "push \\delta;swap;concat;swap;push \\,;concat;swap;concat",
    ' ': "alias i"

    // maybe: '[delegate]': "derivative"
  },

  // [,] prefix: combine two objects with an infix operation
  infix: {
    'a': "apply_infix",
    'b': "infix \\bullet",
    'c': "infix \\cap",
    'C': "infix \\circledcirc",
    'd': "swap;push \\dagger;superscript false;swap;concat",  // x^\dagger y
    'D': "infix \\oplus",  // [D]irect sum
    'e': "infix ,\\dots,",
    'f': "conjunction if",
    'F': "conjunction iff",
    'g': "infix \\gets",
    'G': "infix \\Leftarrow",
    'j': "infix \\Join",
    'k': "infix \\,\\vert\\,",  // x | y  ([k]onditional)
    '|': "alias k",
    'l': "infix \\parallel",
    'm': "operator pmod;concat",  // y (mod x)
    'M': "infix \\mp",
    'n': "conjunction when",
    'o': "infix \\circ",
    'O': "infix \\odot",
    'p': "infix \\perp",
    'P': "infix \\pm",
    'q': "conjunction and",
    'Q': "conjunction or",
    'r': "conjunction for",
    's': "push \\,;swap;concat false;concat false",
    ' ': "alias s",
    'S': "infix \\circledast",
    't': "infix \\to",
    'T': "infix \\longrightarrow",
    'u': "infix \\cup",
    'v': "infix \\vee",
    'V': "infix \\veebar",
    'w': "infix \\wedge",
    'W': "infix \\barwedge",
    'x': "autoparenthesize 2;infix \\times",
    'X': "infix \\otimes",
    '=': "infix \\Rightarrow",
    '+': "infix \\Longrightarrow",
    '-': "infix \\ominus",
    '.': "autoparenthesize 2;infix \\cdot",
    ',': "infix ,",
    '(': "infix ,;delimiters ( )",  // (x,y)
    '>': "infix \\cdots",
    '<': "infix ,;delimiters \\langle \\rangle",  // <x,y>
    '*': "autoparenthesize 2;infix *",
    '^': "autoparenthesize 2;infix \\star",
    ':': "infix \\colon",
    ';': "infix semicolon",
    '`': "swap;autoparenthesize;push T;typeface roman;superscript false;swap;concat",  // xTy
    '~': "push T;typeface roman;superscript false;concat",  // xyT
    '/': "autoparenthesize 2;infix /",
    "\\": "autoparenthesize 2;infix \\backslash",
    '%': "infix \\div",
    'Tab': "infix \\quad",
    '_': "infix \\_",
    "'": "start_text_entry conjunction_entry"

    //'[': "infix \\llcorner",  // right-contraction (uncommon, disabled for now)
    //']': "infix \\lrcorner",  // left-contraction(uncommon, disabled for now)
    //'{': "infix \\leftthreetimes",  // semidirect product
    //'}': "infix \\rightthreetimes",
  },

  // [=] prefix: relational operators
  // NOTE: some of these duplicate (alias) what is in [,], like [=][t]
  relational: {
    '2': "mode variant_relational",
    'a': "infix \\approx",
    'c': "infix \\cong",  // =~ [c]ongruent
    'e': "infix \\leftrightarrow",
    'E': "infix \\longleftrightarrow",
    'f': "infix \\Leftrightarrow",
    'F': "infix \\Longleftrightarrow",
    'g': "infix >",
    'G': "infix \\gg",
    'i': "infix \\in",
    'I': "infix \\notin",
    'j': "infix \\leftarrow",  // not sure about j,J,k,K bindings
    'J': "infix \\longleftarrow",
    'k': "infix \\Leftarrow",
    'K': "infix \\Longleftarrow",
    'l': "infix <",
    'L': "infix \\ll",
    'm': "infix \\mapsto",
    'M': "infix \\longmapsto",
    'n': "infix \\ne",
    '!': "alias n",
    'o': "infix \\circeq",
    'p': "infix \\propto",
    'P': "infix \\simeq",
    'q': "infix =",
    '=': "alias q",
    'Q': "infix \\equiv",
    's': "infix \\subset",
    'S': "infix \\subseteq",
    't': "alias infix t",
    'T': "alias infix T",
    'u': "infix \\supset",
    'U': "infix \\supseteq",
    'v': "alias infix =",
    'V': "alias infix +",
    ';': "infix \\coloncolon",
    ':': "infix \\coloneqq",
    '~': "infix \\sim",
    '.': "infix \\doteq",
    '+': "alias infix +",
    '^': "infix \\triangleq",
    '?': "push ?;push =;operator overset 2;apply_infix",
    '<': "infix \\le",
    '[': "alias <",
    '>': "infix \\ge",
    ']': "alias >",
    '{': "infix \\lll",
    '}': "infix \\ggg",
    '-': "infix \\vdash",
    '|': "infix \\vDash"
  },

  // [=][2] prefix
  variant_relational: {
    's': "infix \\sqsubset",
    'S': "infix \\sqsubseteq",
    'u': "infix \\sqsupset",
    'U': "infix \\sqsupseteq",
    'l': "infix \\prec",
    'g': "infix \\succ",
    'L': "infix \\leqslant",
    'G': "infix \\geqslant",
    '<': "infix \\preceq",
    '[': "alias <",
    '>': "infix \\succeq",
    ']': "alias >"
  },

  // ['] prefix: assorted standalone math symbols
  symbol: {
    '0': "push \\varnothing",
    '1': "integer -1",
    '2': "integer 1;integer 2;fraction",  // 1/2 (display)
    '3': "integer 1;integer 2;infix /",  // 1/2 (inline)
    '8': "push \\infty",
    'a': "push \\forall",
    'A': "push \\aleph",
    'b': "push \\bullet",
    'c': "push \\cdot",
    'C': "push \\bigcap",
    'd': "push \\partial",
    'D': "push \\bigoplus",
    'e': "push \\exists",
    'E': "push \\nexists",
    'h': "push \\hslash",
    'i': "push \\int",
    'I': "push \\iint",
    'l': "push \\ell",
    'M': "push \\mp",
    'n': "push \\ne",
    'o': "push \\circ",
    'O': "push \\bigodot",
    'p': "push \\prod",
    'P': "push \\pm",
    'q': "push =",
    'Q': "push \\bigsqcup",
    'r': "push \\square",
    'R': "push \\boxdot",
    's': "push \\sum",
    'S': "push \\S",
    't': "push \\therefore",
    'U': "push \\bigcup",
    'v': "push \\vee",
    'V': "push \\bigvee",
    'w': "push \\wedge",
    'W': "push \\bigwedge",
    'X': "push \\bigotimes",
    'y': "push \\oint",
    'Y': "push \\oiint",
    '.': "push \\dots",
    '>': "push \\cdots",
    '-': "push -",
    '+': "push +",
    '*': "push \\ast",
    '^': "push \\star",
    '|': "push |",
    '?': "push ?",
    '!': "push !",
    ',': "push ,",
    ';': "push semicolon",
    ':': "push :",
    '`': "push `",
    '~': "push \\sim",
    '/': "push /",
    "\\": "push \\backslash",
    '_': "push \\_",
    'ArrowUp': "push \\uparrow",
    'ArrowDown': "push \\downarrow",
    'ArrowLeft': "push \\leftarrow",
    'ArrowRight': "push \\rightarrow",
    '@': "push @",
    '#': "push \\#",
    '$': "push \\$",
    '%': "push \\%",
    '&': "push \\&",
    '=': "push_separator",
    "'": "push_placeholder",
    ' ': "push "  // "blank", e.g. when you don't want something on one side of an infix
  },

  // [.] prefix: expression decorators (fonts, hats, etc)
  decoration: {
    '0': "integer 0;subscript",
    '1': "integer -1;superscript",
    '2': "integer 2;superscript",
    '3': "integer 3;superscript",
    '4': "integer 4;superscript",
    '8': "push \\infty;infix \\to",
    'A': "hat acute",
    'b': "typeface roman;make_bold",
    'c': "autoparenthesize;push 1;swap;infix -",
    'd': "push \\dagger;superscript",
    'D': "push \\ddagger;superscript",
    'e': "html_class emphasized emphasized2",
    'g': "hat mathring",
    'G': "hat grave",
    'h': "hat hat",
    'H': "operator widehat",
    'i': "push -;superscript",
    'I': "push +;superscript",
    'k': "typeface fraktur",
    'l': "push \\parallel;subscript",
    'm': "typeface typewriter",  // [m]onospace
    'M': "prefix \\mp",
    'n': "hat bar",
    'o': "operator overline",
    'p': "push \\perp;subscript",
    'P': "prefix \\pm",
    'q': "prefix =",
    'r': "typeface roman",
    's': "typeface sans_serif",
    'S': "typeface sans_serif_italic",
    't': "prefix \\to",
    'T': "prefix \\longrightarrow",
    'u': "hat breve",
    'U': "operator utilde",
    'v': "hat vec",
    'V': "operator overrightharpoon",
    'w': "hat check",
    'W': "operator widecheck",
    'x': "operator boxed",
    'X': "operator sout",  // strikeout
    'Y': "operator widetilde",
    'z': "operator bcancel",
    '.': "hat dot",
    '>': "push .;concat",
    "\"": "hat ddot",
    ' ': "push \\,;concat",  // append thin space
    "'": "autoparenthesize;prime",
    ',': "push \\circ;superscript",  // degree marker
    '*': "push *;superscript",  // conjugation
    '^': "autoparenthesize;prefix \\star",  // Hodge star
    '=': "prefix \\Rightarrow",
    '-': "autoparenthesize;negate",
    '+': "autoparenthesize;prefix +",
    '`': "push T;typeface roman;superscript",  // transpose
    '~': "hat tilde",
    '/': "operator cancel",
    "\\": "autoparenthesize;push 1;swap;autoparenthesize;infix /",  // 1/x
    '(': "adjust_size smaller",
    ')': "adjust_size larger",
    '{': "operator overbrace",
    '}': "operator underbrace",
    '[': "operator overbracket",
    ']': "operator underbracket",
    '!': "parenthesize_argument;prefix \\neg",
    '_': "operator underline",
    'Tab': "push \\quad;swap;concat false"
  },

  // [|] prefix: array/matrix operations
  array: {
    '[digit]': "prefix_argument",
    '*': "prefix_argument",
    'a': "align aligned",
    'c': "align cases",
    'C': "align rcases",
    'e': "infix_list ,;push \\dots;push ,;apply_infix",
    'E': "insert_matrix_ellipses",
    'f': "align cases_if",
    'F': "align rcases_if",
    'g': "align gathered",
    'h': "stack_arrays horizontal",
    'k': "substack",
    'm': "matrix_row matrix",
    ' ': "alias m",
    'p': "infix_list +;push \\cdots;push +;apply_infix",
    'r': "autoparenthesize;push Tr;swap;operator operatorname 2",
    's': "split_array",
    't': "mode change_matrix_type",
    'T': "transpose_matrix",
    'v': "matrix_row vmatrix",
    'V': "matrix_row Vmatrix",
    'x': "matrix",
    '|': "stack_arrays vertical",
    ',': "infix_list ,",
    '.': "infix_list , \\dots",
    ';': "infix_list semicolon\\,",
    '+': "infix_list + \\cdots",
    '(': "matrix_row pmatrix",
    '[': "matrix_row bmatrix",
    '{': "matrix_row Bmatrix",
    '@': "matrix_row bmatrix 2;transpose_matrix",
    '#': "matrix_row bmatrix 3;transpose_matrix",
    '$': "matrix_row bmatrix 2;unrot;matrix_row bmatrix 2;swap;stack_arrays vertical",
    ':': "array_separator column dashed",
    '!': "array_separator column solid",
    '_': "array_separator row dashed",
    '-': "array_separator row solid",
    'Enter': "stack_arrays vertical"
  },

  matrix: {
    '[digit]': "prefix_argument",
    'm': "finish_matrix matrix",
    ' ': "alias m",
    'v': "finish_matrix vmatrix",
    'V': "finish_matrix Vmatrix",
    '(': "finish_matrix pmatrix",
    '[': "finish_matrix bmatrix",
    '{': "finish_matrix Bmatrix"
  },

  change_matrix_type: {
    'm': "change_matrix_type matrix",
    ' ': "alias m",
    'v': "change_matrix_type vmatrix",
    'V': "change_matrix_type Vmatrix",
    '(': "change_matrix_type pmatrix",
    '[': "change_matrix_type bmatrix",
    '{': "change_matrix_type Bmatrix"
  },

  // [~] prefix: tensor commands
  tensor: {
    '`': "add_tensor_index right upper",
    '^': "alias `",
    '_': "add_tensor_index right lower",
    'Enter': "alias _",
    'i': "add_tensor_index right both",
    ' ': "alias i",
    'l': "mode tensor(left)",
    '~': "alias l",
    'w': "swap_tensor_index_type",
    'c': "condense_tensor",
    '.': "push \\,\\cdots\\,;affix_tensor_index right",
    ',': "push ,;affix_tensor_index right"
  },

  // [~][l] prefix: tensor commands for left-side indices
  'tensor(left)': {
    '`': "add_tensor_index left upper",
    '^': "alias `",
    '_': "add_tensor_index left lower",
    'Enter': "alias _",
    'i': "add_tensor_index left both",
    ' ': "alias i",
    'l': "mode tensor",  // switch out of (left) mode
    '~': "alias l",
    'w': "swap_tensor_index_type",
    'c': "condense_tensor",
    '.': "push \\,\\cdots\\,;affix_tensor_index left",
    ',': "push ,;affix_tensor_index left"
  },

  // [_] prefix: dissect mode
  // NOTE: The duplicate keybindings here are for the user's convenience
  // (e.g., capitals so they don't have to release the Shift key).
  dissect: {
    '[default]': "cancel_dissect_mode",
    //'Enter': "finish_dissect_mode",
    'q': "cancel_dissect_mode",
    'Q': "alias q",
    'Escape': "alias q",
    // 'Tab': "dissect_undo",  // not implemented
    // 'Ctrl+z': "alias Tab",
    '_': "dissect_descend",
    'u': "dissect_ascend",
    'U': "alias u",
    '[': "dissect_move_selection left",
    '{': "alias [",
    ']': "dissect_move_selection right",
    '}': "alias ]",
    'x': "dissect_extract_selection",
    'X': "alias x",
    'd': "dissect_extract_selection trim",
    'D': "alias d",
    'ArrowUp': "alias u",
    'ArrowDown': "alias _",
    'ArrowLeft': "alias [",
    'ArrowRight': "alias ]",
    'Backspace': "alias d",
    "'": "alias x",
    'c': "dissect_copy_selection",
    'C': "alias c",
    't': "dissect_copy_selection trim",
    'T': "alias t"
  },

  // [#] prefix: SymPy - work in progress
  sympy: {
    '[digit]': "prefix_argument",
    '#': "sympy sympify 1 evaluate",
    '=': "sympy N 1 evalf",  // numeric eval
    '/': "sympy nsimplify 1",  // convert float to "fraction"
    '|': "sympy substitute 3",
    'd': "sympy diff 1 differentiate",
    'D': "sympy diff 2 differentiate",
    'i': "sympy solveset 1 solve",  // [i]solate
    'I': "sympy solveset 2 solve",
    'p': "sympy integrate 1",  // [p]rimitive
    'P': "sympy integrate 2",
    's': "mode sympy_simplify",
    't': "mode sympy_transform",
    'v': "mode sympy_solve",  // TODO: find better keybinding
    'y': "sympy_series_expansion false",
    'Y': "sympy_series_expansion true"
  },

  // [#][s] prefix: SymPy "simplification" commands; these change or rearrange
  // the expression without changing the mathematical meaning.
  sympy_simplify: {
    'a': "sympy apart 1",
    'e': "sympy expand 1",
    'f': "sympy factor 1",
    'l': "sympy logcombine 1",
    'L': "sympy expand_log 1",
    'k': "sympy cancel 1",
    's': "sympy simplify 1",
    't': "sympy together 1"
  },

  // TODO: maybe 'sympy_ode' or 'sympy_diffeq' instead?
  sympy_solve: {
    'c': "sympy classify_ode 2",  // ??
    'd': "all_on_left true;sympy dsolve 2",
    'k': "sympy checkodesol 2"  // TODO: better keybinding
  },

  // [#][t] prefix: SymPy integral transforms
  sympy_transform: {
    'c': "sympy cosine_transform 3",
    'C': "sympy inverse_cosine_transform 3",
    'f': "sympy fourier_transform 3",
    'F': "sympy inverse_fourier_transform 3",
    'h': "sympy hankel_transform 4",
    'H': "sympy inverse_hankel_transform 4",
    'l': "sympy laplace_transform 3",
    'L': "sympy inverse_laplace_transform 3",
    'm': "sympy mellin_transform 3",
    'M': "sympy inverse_mellin_transform 4",
    's': "sympy sine_transform 3",
    'S': "sympy inverse_sine_transform 3"
  },

  // [#] prefix: symbolic algebra mode
  algebrite: {
    '#': "algebrite bothsides eval",
    '/': "rationalize",  // not part of Algebrite
    '=': "algebrite bothsides float",
    '*': "algebrite default conj",
    'A': "algebrite default arg",
    'c': "algebrite_completesquare true",
    'C': "algebrite_completesquare false",
    'd': "algebrite bothsides derivative 1 1",
    'D': "algebrite bothsides derivative 2",
    'e': "algebrite bothsides circexp",
    'f': "algebrite bothsides factor 1 1",
    'F': "algebrite bothsides factor 2",
    'i': "algebrite bothsides integral 1 1",
    'I': "algebrite bothsides integral 2",
    'j': "algebrite bothsides defint 3 1",
    'J': "algebrite bothsides defint 4",
    'm': "algebrite default sum 3 1",
    'M': "algebrite default sum 4",
    'o': "algebrite default product 3 1",
    'O': "algebrite default product 4",
    'p': "mode algebrite_polynomial",
    'P': "algebrite bothsides polar",
    'q': "algebrite_check",
    'Q': "algebrite_check true",
    'r': "algebrite bothsides rationalize",
    'R': "algebrite bothsides rect",
    's': "algebrite bothsides simplify",
    't': "integer 7;integer 0;algebrite default taylor 3 1",
    'T': "swap;algebrite default taylor 4",  // NOTE: last two arguments are swapped
    'v': "algebrite default eigenval",
    'V': "algebrite default eigenvec;transpose_matrix",
    'w': "algebrite bothsides eval 2 1",
    'W': "algebrite bothsides eval 3",
    'x': "algebrite bothsides expand 1 1",
    'X': "algebrite bothsides expand 2",
    'y': "all_on_left true;algebrite default nroots 1 1",  // TODO: display the guessed variable: x=[...] (for roots() too)
    'Y': "swap;all_on_left true;swap;algebrite default nroots 2",
    'z': "all_on_left true;algebrite default roots 1 1",
    'Z': "swap;all_on_left true;swap;algebrite default roots 2"
  },

  algebrite_polynomial: {
    'p': "push x;swap;algebrite default legendre 2",
    'P': "push x;unrot;algebrite default legendre 3",
    'l': "push x;swap;algebrite default laguerre 2",
    'L': "push x;unrot;algebrite default laguerre 3",
    'h': "push x;swap;algebrite default hermite 2",
    'j': "push x;swap;algebrite default besselj 2",
    'y': "push x;swap;algebrite default bessely 2"
  },

  // [@] prefix: \mathcal letters (uppercase only)
  calligraphic: {
    '[alpha]': "push_last_keypress;uppercase;typeface calligraphic",
    '@': "push @"  // undocumented
  },

  // [%] prefix: \mathbb letters (uppercase only except 'k')
  blackboard: {
    '[alpha]': "push_last_keypress;uppercase;typeface blackboard",
    'k': "push k;typeface blackboard",  // there's (only) a lowercase k in LaTeX (aka \Bbbk).
    '%': "push \\%"  // undocumented
  },

  // [&] prefix: \mathscr letters (uppercase only)
  script: {
    '[alpha]': "push_last_keypress;uppercase;typeface script",
    '&': "push \\&"  // undocumented
  },

  // [;] or [:] prefix: Greek letters
  greek: {
    'a': "push \\alpha",      'b': "push \\beta",
    'c': "push \\xi",         'd': "push \\delta",
    'e': "push \\epsilon",    'f': "push \\phi",
    'g': "push \\gamma",      'h': "push \\eta",
    'i': "push \\iota",       'j': "push \\varphi",
    'k': "push \\kappa",      'l': "push \\lambda",
    'm': "push \\mu",         'n': "push \\nu",
    'o': "push \\omega",      'p': "push \\pi",
    'q': "push \\vartheta",   'r': "push \\rho",
    's': "push \\sigma",      't': "push \\tau",
    'u': "push \\upsilon",    'v': "push \\theta",
    'w': "push \\omega",      'x': "push \\chi",
    'y': "push \\psi",        'z': "push \\zeta",

    'A': "push A",            'B': "push B",
    'C': "push \\Xi",         'D': "push \\Delta",
    'E': "push \\varepsilon", 'F': "push \\Phi",
    'G': "push \\Gamma",      'H': "push \\mho",
    'I': "push I",            'J': "push \\Phi",
    'K': "push \\varkappa",   'L': "push \\Lambda",
    'M': "push \\varpi",      'N': "push \\nabla",
    'O': "push \\Omega",      'P': "push \\Pi",
    'Q': "push \\Theta",      'R': "push \\varrho",
    'S': "push \\Sigma",      'T': "push \\varsigma",
    'U': "push \\Upsilon",    'V': "push \\Theta",
    'W': "push \\Omega",      'X': "push X",
    'Y': "push \\Psi",        'Z': "push Z",

    // '6': "push \\digamma",

    '2': "mode variant_greek",
    ';': "infix semicolon",
    ':': "infix :"
  },

  // [;][2] prefix: "variant" uppercase Greek letters
  // (these are italic versions of the normal ones)
  variant_greek: {
    'c': "push \\varXi",       'C': "push \\varXi",
    'd': "push \\varDelta",    'D': "push \\varDelta",
    'f': "push \\varPhi",      'F': "push \\varPhi",
    'g': "push \\varGamma",    'G': "push \\varGamma",
    'l': "push \\varLambda",   'L': "push \\varLambda",
    'o': "push \\varOmega",    'O': "push \\varOmega",
    'p': "push \\varPi",       'P': "push \\varPi",
    'q': "push \\varTheta",    'Q': "push \\varTheta",
    's': "push \\varSigma",    'S': "push \\varSigma",
    'u': "push \\varUpsilon",  'U': "push \\varUpsilon",
    'v': "push \\varTheta",    'V': "push \\varTheta",
    'y': "push \\varPsi",      'Y': "push \\varPsi"
  }
};


export { Keymap };
