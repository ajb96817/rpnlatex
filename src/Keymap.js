
const EditorKeymap = {
  base: {
    // Letters/numbers and some symbols immediately push onto the stack
    '[alnum]': "self_push",
    '*': "push *",
    '~': "push \\sim",

    // Immediate action special keys
    'Enter': "subscript",
    'Shift+Enter': "edit_item",
    // NOTE: ! receives special processing in do_concat (cf. Expr.combine_pair),
    //       becoming a PostfixExpr.
    '!': "autoparenthesize;push !;concat",
    '^': "superscript",
    'Backspace': "pop",
    "`": "superscript",
    ' ': "concat",
    '<': "infix <",
    '>': "infix >",
    '+': "infix +",
    '-': "autoparenthesize;infix -",
    ']': "make_bold",
    '[': "delimiters [ ]",
    '(': "delimiters ( )",
    '{': "delimiters \\{ \\}",

    // Document commands
    'ArrowUp': "change_document_selection -1",
    'Shift+ArrowUp': "shift_document_selection -1",
    'ArrowDown': "change_document_selection +1",
    'Shift+ArrowDown': "shift_document_selection +1",
    'PageUp': "change_document_selection -5",  // TODO: scroll based on viewport height instead
    'PageDown': "change_document_selection +5",
    'Home': "change_document_selection -10000",
    'End': "change_document_selection +10000",

    // Horizontal scrolling commands
    'ArrowRight': "scroll stack_panel horizontal 50",
    'ArrowLeft': "scroll stack_panel horizontal -50",
    'Shift+ArrowRight': "scroll document_container horizontal 50",
    'Shift+ArrowLeft': "scroll document_container horizontal -50",

    // Prefix keys
    'Tab': "mode stack",
    "'": "mode symbol",
    '.': "mode decoration",
    ',': "mode infix",
    '=': "mode relational",
    ')': "mode delimiters",
    ';': "mode lowercase_greek",
    ':': "mode uppercase_greek",
    '@': "mode calligraphic",
    '&': "mode script",
    '%': "mode blackboard",
    '/': "mode operator",
    "\\": "start_text_entry math_entry",
    "\"": "start_text_entry text_entry",
    '|': "mode array",
    '_': "start_dissect_mode",
    '#': "mode algebrite",
    '$': "mode config",
    '?': "toggle_popup help",

    // Other Ctrl-based shortcuts
    'Ctrl+0': "integer 0;subscript",
    'Ctrl+1': "integer -1;superscript",
    'Ctrl+2': "integer 2;superscript",
    'Ctrl+3': "integer 3;superscript",
    'Ctrl+4': "integer 4;superscript",
    'Ctrl+a': "swap",
    'Ctrl+b': "make_bold",
    'Ctrl+c': "copy_to_clipboard",
    'Ctrl+e': "push e;typeface roman;swap;superscript",  // exp(x): same as [/][e]
    'Ctrl+i': "pop_to_document",
    'Ctrl+j': "extract_from_document",
    'Ctrl+k': "infix \\,\\vert\\,;parenthesize;build_function_call",  // f(x|y): same as [/][k]
    'Ctrl+K': "unrot;infix ,;swap;infix \\,\\vert\\,;parenthesize;build_function_call",  // f x y z -> f(x,y|z): same as [/][K]
    'Ctrl+l': "recenter_document 50",
    'Ctrl+m': "autoparenthesize;negate",  // same as [.][-]
    'Ctrl+o': "parenthesize;build_function_call",  // -> f(x): same as [/][o]
    'Ctrl+p': "delimiters ( )",  // same as [(]
    'Ctrl+r': "infix ,;parenthesize;build_function_call",  // -> f(x,y): same as [/][r]
    'Ctrl+R': "infix ,;infix ,;parenthesize;build_function_call",  // f x y z -> f(x,y,z): same as [/][R]
    'Ctrl+s': "save_file",
    'Ctrl+u': "superscript",
    'Ctrl+v': "paste_from_clipboard",
    'Ctrl+w': "swap_floating_item",
    'Ctrl+x': "push x;parenthesize;build_function_call",  // f -> f(x)
    'Ctrl+y': "redo",
    'Ctrl+z': "undo",
    'Ctrl+ ': "push \\,;swap;concat false;concat false",  // same as [,][ ]
    'Ctrl+,': "infix ,",
    'Ctrl+/': "operator frac 2",
    'Ctrl+ArrowRight': "scroll document_container horizontal 75",
    'Ctrl+ArrowLeft': "scroll document_container horizontal -75",
    'Ctrl+Backspace': "nip"
  },

  // File Manager mode
  files: {
    'default': "toggle_popup files",
    'd': "delete_selected_file",
    'n': "start_new_file",
    'Enter': "load_selected_file",
    'x': "export_selected_file",
    's': "save_file",
    'S': "save_file_as",
    'ArrowUp': "select_adjacent_file -1",
    'ArrowDown': "select_adjacent_file 1",
    'j': 'scroll popup_panel vertical 25',
    'k': 'scroll popup_panel vertical -25'
  },

  // User Guide mode
  help: {
    'ArrowDown': 'scroll popup_panel vertical 25',
    'ArrowUp': 'scroll popup_panel vertical -25',
    'j': 'scroll popup_panel vertical 25',
    'k': 'scroll popup_panel vertical -25',
    'ArrowLeft': 'cancel',  // 'cancel' here means don't hide the help text
    'ArrowRight': 'cancel',
    'PageDown': 'scroll popup_panel vertical 95',
    'PageUp': 'scroll popup_panel vertical -95',
    'J': 'scroll popup_panel vertical 95',
    'K': 'scroll popup_panel vertical -95',
    'Home': 'scroll popup_panel top',
    'End': 'scroll popup_panel bottom',

    // Quick navigation to each section:
    '&': "scroll_to help_insert_script",
    '%': "scroll_to help_insert_blackboard",
    '@': "scroll_to help_insert_calligraphic",
    "\\": "scroll_to help_math_entry",
    "\"": "scroll_to help_text_entry",
    "Shift+Enter": "scroll_to help_edit_text",
    'Tab': "scroll_to help_stack",
    "'": "scroll_to help_symbols",
    '.': "scroll_to help_decorations",
    ',': "scroll_to help_infix",
    '=': "scroll_to help_relational",
    '/': "scroll_to help_operators",
    'd': "scroll_to help_derivatives",
    'D': "scroll_to help_derivatives",
    'i': "scroll_to help_integrals",
    'f': "scroll_to help_named_operators",
    ')': "scroll_to help_delimiters",
    '(': "scroll_to help_delimiters",
    '[': "scroll_to help_delimiters",
    '{': "scroll_to help_delimiters",
    '|': "scroll_to help_arrays",
    '_': "scroll_to help_dissect",
    '#': "scroll_to help_cas",
    ';': "scroll_to help_greek",
    ':': "scroll_to help_greek",
    '$': "scroll_to help_configuration",
    'Backspace': "scroll_to help_prefix_keys",
    'c': "scroll_to help_control_keys",  // undocumented

    'q': "toggle_popup help",
    '?': "toggle_popup help;config dock_helptext on",
    'default': "toggle_popup help"
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
    'w': "swap_floating_item",
    'X': "reset_all",
    'y': "redo",
    'z': "undo",
    'Enter': "dup",
    'Backspace': "pop",
    '!': "export_document_as_text",
    '@': "export_stack_items_as_text",
    '$': "extract_latex_source",
    'ArrowRight': "scroll document_container horizontal 75",
    'ArrowLeft': "scroll document_container horizontal -75"
  },

  // [$] prefix: configuration
  config: {
    '[digit]': "prefix_argument",
    '*': "prefix_argument",
    'ArrowLeft': "config stack_side left",
    'ArrowRight': "config stack_side right",
    'ArrowUp': "config stack_side top",
    'ArrowDown': "config stack_side bottom",
    'C': "config toggle_hide_mouse_cursor",
    'E': "config eink_mode",
    'f': "fullscreen on",
    'F': "fullscreen off",
    'i': "config toggle_inline_math",
    'I': "config toggle_mode_indicator",
    'm': "config math_align toggle_stack",
    'M': "config math_align toggle_document",
    'r': "config reset_layout",
    'R': "config reload_page",
    's': "config stack_split",
    'S': "config sepia",
    'V': "config inverse_video",
    'z': "config zoom_factor increase",
    '+': "config zoom_factor increase",
    'Z': "config zoom_factor decrease",
    '-': "config zoom_factor decrease",
    '_': "config zoom_factor decrease",  // undocumented alias for z/-
    '(': "config autoparenthesize on",
    ')': "config autoparenthesize off",
    '$': "push \\$"  // undocumented
  },

  // Delegate (shared) keymap for the 5 text_entry modes' editor commands.
  _editor_commands: {
    'Escape': "cancel_text_entry",
    'Ctrl+z': "cancel_text_entry",
    'Backspace': "text_entry_backspace backspace",
    'Shift+Backspace': "text_entry_backspace backspace",
    'Delete': "text_entry_backspace delete",
    'ArrowLeft': "text_entry_move_cursor left",
    'ArrowRight': "text_entry_move_cursor right",
    'Home': "text_entry_move_cursor begin",
    'End': "text_entry_move_cursor end",
    // NOTE: Ctrl editor commands here are undocumented
    'Ctrl+a': "text_entry_move_cursor begin",
    'Ctrl+ArrowLeft': "text_entry_move_cursor begin",
    'Ctrl+d': "text_entry_backspace delete",
    'Ctrl+e': "text_entry_move_cursor end",
    'Ctrl+ArrowRight': "text_entry_move_cursor end",
    'Ctrl+f': "text_entry_move_cursor right",
    'Ctrl+b': "text_entry_move_cursor left",
    'default': "append_text_entry"
  },

  // ["] prefix: text entry
  text_entry: {
    'Enter': "finish_text_entry text",
    'Shift+Enter': "finish_text_entry heading",
    'delegate': "_editor_commands"
  },

  // [\] prefix: math entry
  math_entry: {
    'Enter': "finish_text_entry math",
    'Shift+Enter': "finish_text_entry roman_text",
    'Tab': "finish_text_entry operatorname",
    'delegate': "_editor_commands"
  },

  // [\][\] prefix: latex command
  latex_entry: {
    'Enter': "finish_text_entry latex",
    'Shift+Enter': "finish_text_entry latex_unary",
    'Delete': "text_entry_backspace delete math_entry",
    'Backspace': "text_entry_backspace backspace math_entry",
    'delegate': "_editor_commands"
  },

  // [,]['] prefix: custom conjunction
  conjunction_entry: {
    'Enter': "finish_text_entry conjunction",
    'Shift+Enter': "finish_text_entry bold_conjunction",
    'delegate': "_editor_commands"
  },

  // [/][;] prefix: equation tag
  tag_entry: {
    'Enter': "finish_text_entry tag",
    'delegate': "_editor_commands"
  },

  // [)] prefix: special delimiters
  delimiters: {
    'b': "delimiters \\langle \\vert",  // <x| Dirac bra
    'c': "delimiters \\lceil \\rceil",
    'd': "push \\llbracket;swap;concat false;push \\rrbracket;concat false",  // NOTE: non flex size due to KaTeX limitation
    'f': "delimiters \\lfloor \\rfloor",
    'F': "toggle_fixed_size_delimiters",
    'g': "delimiters \\lgroup \\rgroup",
    'i': "infix \\,\\vert\\,;delimiters \\langle \\rangle",  // <x|y>; mnemonic: [i]nner product
    'I': "infix \\,\\vert\\,;infix \\,\\vert\\,;delimiters \\langle \\rangle",  // <x|y|z>
    'k': "delimiters \\vert \\rangle",  // |x> Dirac ket
    'l': "mode modify_left",
    'L': "mode modify_left",
    'm': "delimiters \\lmoustache \\rmoustache",
    'n': "delimiters \\lVert \\rVert",  // n = Norm
    'N': "delimiters \\lVert \\rVert",  // alias for n
    'o': "delimiters ( ]",  // half-closed interval
    'O': "delimiters [ )",
    'r': "mode modify_right",
    'R': "mode modify_right",
    'w': "delimiters . \\vert",  // "where"
    'W': "delimiters . \\vert",  // alias for w
    'x': "remove_delimiters",
    'X': "remove_delimiters",
    '|': "delimiters \\vert \\vert",
    '<': "delimiters \\langle \\rangle",
    '(': "delimiters ( .",
    ')': "delimiters . )",
    '[': "delimiters [ .",
    ']': "delimiters . ]",
    '{': "delimiters \\{ .",
    '}': "delimiters . \\}",
    '.': "delimiters . .",
    ' ': "delimiters . ."
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
    '1': "integer 1;swap;operator frac 2",
    '2': "mode squared",
    'a': "operator frac 2",
    'b': "operator binom 2",
    'c': "named_function cos",
    'C': "named_function csc",
    'd': "mode derivative",
    'D': "mode derivative_alt",
    'e': "push e;typeface roman;swap;superscript",  // exp(x)
    'E': "named_function exp",
    'f': "mode named_operator",
    'g': "push \\int;swap;superscript;swap;subscript",
    'h': "mode hyperbolic",
    'i': "mode integral_limits",
    'j': "mode integral_with_limits",
    //'J': "operator atop 2",  // not that useful
    'k': "infix \\,\\vert\\,;parenthesize;build_function_call",  // f x y -> f(x|y)
    'K': "unrot;infix ,;swap;infix \\,\\vert\\,;parenthesize;build_function_call",  // f x y z -> f(x,y|z)
    'l': "push \\limits;swap;subscript;push \\lim;swap;concat",  // lim_{x}
    'L': "infix \\to;push \\limits;swap;subscript;push \\lim;swap;concat",  // lim_{y \to x}
    'm': "parenthesize_argument;push Im;swap;operator operatorname 2",  // Im(x)
    'M': "parenthesize_argument;push Re;swap;operator operatorname 2",  // Re(x)
    'n': "named_function ln",
    'N': "named_function log",
    'o': "parenthesize;build_function_call",  // f x -> f(x)  "[o]f"
    'O': "swap;operator overset 2",
    'p': "parenthesize;push P;typeface blackboard;swap;build_function_call",  // P(X) (probability)
    'P': "infix \\,\\vert\\,;parenthesize;push P;typeface blackboard;swap;build_function_call",  // P(y|x)
    'q': "operator sqrt",
    'Q': "operator sqrt[3]",
    'r': "infix ,;parenthesize;build_function_call",  // f x y -> f(x,y)
    'R': "infix ,;infix ,;parenthesize;build_function_call",  // f x y z -> f(x,y,z)
    's': "named_function sin",
    'S': "named_function sec",
    't': "named_function tan",
    'T': "named_function cot",
    'U': "swap;operator underset 2",
    'v': "parenthesize [ ];push Var;typeface roman;swap;build_function_call",  // Var[x]
    'V': "infix ,;parenthesize [ ];push Cov;typeface roman;swap;build_function_call",  // Cov[x,y]
    'w': "swap_infix",
    'x': "delimiters [ ];push E;typeface blackboard;swap;build_function_call",  // E[x] (expectation)
    'X': "infix \\,\\vert\\,;delimiters [ ];push E;typeface blackboard;swap;build_function_call",  // E[y|x]
    'y': "push E;typeface blackboard;swap;subscript;swap;delimiters [ ];build_function_call",  // E_x[y] (with subscript)
    'Y': "push E;typeface blackboard;swap;subscript;unrot;infix \\,\\vert\\,;delimiters [ ];build_function_call",  // E_x[z|y]
    'z': "dissolve",
    ' ': "swap;concat",
    ';': "start_text_entry tag_entry",
    ',': "infix_linebreak",
    '/': "operator frac 2",
    '[': "parenthesize [ ];build_function_call",  // f x -> f[x]
    ']': "parenthesize \\{ \\};build_function_call",  // f x -> f{x}
    '{': "swap;operator overbrace;swap;superscript",
    '}': "swap;operator underbrace;swap;subscript",
    '<': "extract_infix_side left",
    '>': "extract_infix_side right",
    '!': "negate_infix",
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
    'a': "parenthesize_argument;operator arg",
    'd': "parenthesize_argument;operator dim",
    'D': "operator deg",
    'e': "parenthesize_argument;push erf;swap;operator operatorname 2",
    'E': "parenthesize_argument;push erfc;swap;operator operatorname 2",
    'g': "parenthesize_argument;operator gcd",
    'h': "operator hom",
    'i': "operator inf",
    'I': "operator liminf",
    'k': "parenthesize_argument;operator ker",
    'l': "operator lim",
    'm': "parenthesize_argument;operator min",
    'M': "operator argmin",
    'n': "parenthesize_argument;push sgn;swap;operator operatorname 2",
    'r': "autoparenthesize;push Tr;swap;operator operatorname 2",
    's': "operator sup",
    'S': "operator limsup",
    't': "named_function det",
    'x': "parenthesize_argument;operator max",
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
  integral_limits: {
    'r': "push \\infty;negate;subscript;push \\infty;superscript",  // -oo..oo : [r]eals
    'n': "push \\infty;negate;subscript;integer 0;superscript",  // -oo..0 : [n]egative 
    'p': "integer 0;subscript;push \\infty;superscript",  // 0..oo : [p]ositive
    'u': "integer 0;subscript;integer 1;superscript",  // 0..1 : [u]nit
    'U': "integer -1;subscript;integer 1;superscript",  // -1..1 : symmetric [U]nit
    't': "integer 0;subscript;integer 2;push \\pi;concat;superscript",  // 0..2pi : [t]rigonometric
    'T': "push \\pi;negate;subscript;push \\pi;superscript"  // -pi..pi : symmetric [T]rigonometric
  },

  // [/][j] prefix
  // (same as /i, but create the integral sign too)
  integral_with_limits: {
    'r': "push \\int;push \\infty;negate;subscript;push \\infty;superscript",
    'n': "push \\int;push \\infty;negate;subscript;integer 0;superscript",
    'p': "push \\int;integer 0;subscript;push \\infty;superscript",
    'u': "push \\int;integer 0;subscript;integer 1;superscript",
    'U': "push \\int;integer -1;subscript;integer 1;superscript",
    't': "push \\int;integer 0;subscript;integer 2;push \\pi;concat;superscript",
    'T': "push \\int;push \\pi;negate;subscript;push \\pi;superscript"
  },

  // [/][d] prefix: derivative operations
  derivative: {
    // \partial y / \partial x
    'j': "push \\partial;swap;concat;swap;push \\partial;swap;concat;swap;operator frac 2",
    // \partial^2 y / \partial x^2
    'J': "integer 2;superscript;push \\partial;swap;concat;swap;push \\partial;integer 2;superscript;swap;concat;swap;operator frac 2",
    // dy/dx
    'k': "push d;swap;concat;swap;push d;swap;concat;swap;operator frac 2",
    // d^2(y) / dx^2
    'K': "integer 2;superscript;push d;swap;concat;swap;push d;integer 2;superscript;swap;concat;swap;operator frac 2",
    // \partial / \partial x
    'q': "push \\partial;swap;concat;push \\partial;swap;operator frac 2",
    // \partial^2 / \partial x^2
    'Q': "integer 2;superscript;push \\partial;swap;concat;push \\partial;integer 2;superscript;swap;operator frac 2",
    // d/dx
    'x': "push d;swap;concat;push d;swap;operator frac 2",
    // d^2 / dx^2
    'X': "integer 2;superscript;push d;swap;concat;push d;integer 2;superscript;swap;operator frac 2",
    // \partial^2 / \partial x\,\partial y
    'm': "push \\partial;swap;concat;push \\partial;rot;concat;swap;push \\,;swap;concat;concat;push \\partial;integer 2;superscript;swap;operator frac 2",
    // \partial^2 z / \partial x\,\partial y
    'M': "push \\partial;swap;concat;push \\partial;rot;concat;swap;push \\,;swap;concat;concat;swap;push \\partial;integer 2;superscript;swap;concat;swap;operator frac 2",
    // gradient
    'g': "push \\nabla;swap;concat",
    // gradient with respect to x
    'G': "push \\nabla;swap;subscript;swap;concat",
    // divergence
    '.': "push \\nabla;swap;infix \\cdot",
    // curl
    'c': "push \\nabla;swap;infix \\times",
    // Laplacian
    'l': "push \\nabla;integer 2;superscript;swap;concat",
    // Delta-x
    'n': "push \\Delta;swap;concat",  // i[n]crement (?)
    // x -> dx
    'd': "push d;swap;fuse",
    // x -> \partial x
    'p': "push \\partial;swap;fuse",
    // y x -> \partial_x y
    'P': "push \\partial;swap;subscript;swap;fuse",
    // x y -> dx ^ dy
    'f': "differential_form 2 false false",
    // x y z -> dx ^ dy ^ dz
    'F': "differential_form 3 false false",
    // x y -> dx ^ ... ^ dy
    'E': "differential_form 2 true false",
    // x -> d^2x
    '2': "push d;integer 2;superscript;swap;fuse",
    '3': "push d;integer 3;superscript;swap;fuse",
    '4': "push d;integer 4;superscript;swap;fuse",
    // y x -> y dx
    'i': "autoparenthesize;swap;push \\,;concat;swap;push d;swap;fuse;concat",
    // y x -> ydx (with thinspace after the dx)
    'I': "autoparenthesize;push d;swap;fuse;concat;push \\,;concat",
    // y x -> ydx (no spacing around the dx)
    ' ': "autoparenthesize;push d;swap;fuse;concat"
  },

  derivative_alt: {
    'd': "push d;typeface roman;swap;fuse",
    'f': "differential_form 2 false true",
    'F': "differential_form 3 false true",
    'E': "differential_form 2 true true",
    '2': "push d;typeface roman;integer 2;superscript;swap;fuse",
    '3': "push d;typeface roman;integer 3;superscript;swap;fuse",
    '4': "push d;typeface roman;integer 4;superscript;swap;fuse",
    'i': "autoparenthesize;swap;push \\,;concat;swap;push d;typeface roman;swap;fuse;concat",
    'I': "autoparenthesize;push d;typeface roman;swap;fuse;concat;push \\,;concat",
    ' ': "autoparenthesize;push d;typeface roman;swap;fuse;concat",
    'k': "push d;typeface roman;swap;concat;swap;push d;typeface roman;swap;concat;swap;operator frac 2",
    'K': "integer 2;superscript;push d;typeface roman;swap;concat;swap;push d;typeface roman;integer 2;superscript;swap;concat;swap;operator frac 2",
    'x': "push d;typeface roman;swap;concat;push d;typeface roman;swap;operator frac 2",
    'X': "integer 2;superscript;push d;typeface roman;swap;concat;push d;typeface roman;integer 2;superscript;swap;operator frac 2",
    'delegate': "derivative"
  },

  // [,] prefix: combine two objects with an infix operation
  infix: {
    'a': "apply_infix",
    'b': "infix \\bullet",
    'c': "infix \\cap",
    'd': "swap;push \\dagger;superscript false;swap;concat",  // x^\dagger y
    'e': "infix ,\\dots,",
    'f': "conjunction if",
    'F': "conjunction iff",
    'j': "infix \\Join",
    'g': "infix \\gets",
    'k': "infix \\,\\vert\\,",  // x | y  ([k]onditional)
    '|': "infix \\,\\vert\\,",  // (alias for k)
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
    ' ': "push \\,;swap;concat false;concat false",
    't': "infix \\to",
    'T': "infix \\longrightarrow",
    'u': "infix \\cup",
    'v': "infix \\vee",
    'V': "infix \\veebar",
    'w': "infix \\wedge",
    'W': "infix \\barwedge",
    'x': "infix \\times",
    'X': "infix \\otimes",
    '=': "infix \\Rightarrow",
    '-': "infix \\ominus",
    '+': "infix \\oplus",
    '.': "infix \\cdot",
    ',': "infix ,",
    ':': "infix \\colon",
    ';': "infix semicolon",
    "'": "start_text_entry conjunction_entry",
    '`': "swap;push T;typeface roman;superscript false;swap;concat",  // xTy
    '*': "infix *",
    '%': "infix \\div",
    '(': "infix ,;delimiters ( )",  // (x,y)
    '[': "infix \\llcorner",  // right-contraction
    ']': "infix \\lrcorner",  // left-contraction
    '<': "infix ,;delimiters \\langle \\rangle",  // <x,y>
    '>': "infix \\cdots",
    //'{': "infix \\leftthreetimes",  // semidirect product
    //'}': "infix \\rightthreetimes",
    '/': "autoparenthesize 2;infix /",
    "\\": "autoparenthesize 2;infix \\backslash",
    'Tab': "infix \\quad"
  },

  // [=] prefix: relational operators
  relational: {
    '2': "mode variant_relational",
    'a': "infix \\approx",
    'c': "infix \\cong",  // =~  congruent
    'e': "infix \\equiv",
    'E': "infix \\iff",
    'g': "infix >",
    'f': "infix \\Leftarrow", // "[f]rom"
    'G': "infix \\gg",
    'i': "infix \\in",
    'I': "infix \\in;negate_infix",
    'l': "infix <",
    'L': "infix \\ll",
    'm': "infix \\mapsto",
    'n': "infix \\ne",
    '!': "infix \\ne",
    'o': "infix \\circeq",
    'p': "infix \\propto",
    'q': "infix =",
    's': "infix \\subset",
    'S': "infix \\subseteq",
    't': "infix \\sim",
    'u': "infix \\supset",
    'U': "infix \\supseteq",
    '=': "infix =",
    '^': "infix \\triangleq",
    '<': "infix \\le",
    '>': "infix \\ge",
    '[': "infix \\le",
    ']': "infix \\ge",
    '{': "infix \\lll",
    '}': "infix \\ggg",
    '.': "infix \\doteq",
    ':': "infix \\coloneqq",
    ';': "infix \\coloncolon",
    '~': "infix \\sim",
    '-': "infix \\vdash",
    '|': "infix \\vDash",
    '?': "push ?;push =;operator overset 2;apply_infix"
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
    '[': "infix \\preceq",
    '>': "infix \\succeq",
    ']': "infix \\succeq"
  },

  // ['] prefix: assorted standalone math symbols
  symbol: {
    '0': "push \\varnothing",
    '1': "integer -1",
    '2': "integer 1;integer 2;operator frac 2",  // 1/2 (display)
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
    '*': "push \\star",
    '|': "push |",
    '=': "push_separator",
    '?': "push ?",
    '!': "push !",
    ',': "push ,",
    ';': "push semicolon",
    ':': "push :",
    '`': "push `",
    '_': "push \\_",
    "'": "push_placeholder",
    ' ': "push ",  // "blank", e.g. when you don't want something on one side of an infix
    '/': "push /",
    "\\": "push \\backslash",
    '@': "push @",
    '%': "push \\%",
    '&': "push \\&",
    '#': "push \\#",
    '$': "push \\$",
    'ArrowUp': "push \\uparrow",
    'ArrowDown': "push \\downarrow",
    'ArrowLeft': "push \\leftarrow",
    'ArrowRight': "push \\rightarrow"
  },

  // [.] prefix: expression decorators (fonts, hats, etc)
  decoration: {
    '0': "integer 0;subscript",
    '1': "integer -1;superscript",
    '2': "integer 2;superscript",
    '3': "integer 3;superscript",
    '4': "integer 4;superscript",
    '8': "push \\infty;infix \\to",
    'A': "apply_hat acute",
    'b': "typeface roman;make_bold",  // becomes \bold{...}
    'c': "autoparenthesize;push 1;swap;infix -",
    'd': "push \\dagger;superscript",
    'D': "push \\ddagger;superscript",
    'e': "html_class emphasized emphasized2",
    'g': "apply_hat mathring",
    'G': "apply_hat grave",
    'h': "apply_hat hat",
    'H': "operator widehat",
    'i': "push -;superscript",
    'I': "push +;superscript",
    'k': "typeface fraktur",
    'l': "push \\parallel;subscript",
    'm': "typeface typewriter",  // [m]onospace
    'M': "prefix \\mp",
    'n': "apply_hat bar",
    'o': "operator overline",
    'p': "push \\perp;subscript",
    'P': "prefix \\pm",
    'q': "prefix =",
    'r': "typeface roman",
    's': "typeface sans_serif",
    'S': "typeface sans_serif_italic",
    't': "prefix \\to",
    'T': "prefix \\longrightarrow",
    'u': "apply_hat breve",
    'U': "operator utilde",
    'v': "apply_hat vec",
    'V': "operator overrightharpoon",
    'w': "apply_hat check",
    'W': "operator widecheck",
    'x': "operator boxed",
    'X': "operator sout",  // strikeout
    'Y': "operator widetilde",
    'z': "operator cancel",
    '.': "apply_hat dot",
    '>': "push .;concat",
    "\"": "apply_hat ddot",
    ' ': "push \\,;concat",  // append thin space
    "'": "autoparenthesize;prime",
    '*': "push *;superscript",
    '~': "apply_hat tilde",
    '=': "prefix \\Rightarrow",
    '-': "autoparenthesize;negate",
    '+': "autoparenthesize;prefix +",
    '`': "push T;typeface roman;superscript",  // transpose
    '/': "autoparenthesize;push 1;swap;autoparenthesize;infix /",  // 1/x
    '_': "operator underline",
    '!': "autoparenthesize;prefix \\neg",
    "\\": "operator bcancel",
    '[': "adjust_size smaller",
    ']': "adjust_size larger",
    '{': "operator overbrace",
    '}': "operator underbrace",
    'Tab': "push \\quad;swap;concat false"
  },

  // [|] prefix: array/matrix operations
  array: {
    '[digit]': "prefix_argument",
    '*': "prefix_argument",
    'a': "build_align aligned",
    'c': "build_align cases",
    'C': "build_align rcases",
    'e': "build_infix_list ,;push \\dots;push ,;apply_infix",
    'E': "insert_matrix_ellipses",
    'f': "build_align cases_if",
    'F': "build_align rcases_if",
    'g': "build_align gathered",
    'h': "stack_arrays horizontal",
    'k': "build_substack",
    'm': "build_matrix_row matrix",
    ' ': "build_matrix_row matrix",
    'p': "build_infix_list +;push \\cdots;push +;apply_infix",
    'r': "autoparenthesize;push Tr;swap;operator operatorname 2",
    's': "split_array",
    't': "mode change_matrix_type",
    'T': "transpose_matrix",
    'v': "build_matrix_row vmatrix",
    'V': "build_matrix_row Vmatrix",
    'x': "build_matrix",
    '|': "stack_arrays vertical",
    ',': "build_infix_list ,",
    '.': "build_infix_list , \\dots",
    ';': "build_infix_list semicolon\\,",
    '+': "build_infix_list + \\cdots",
    '(': "build_matrix_row pmatrix",
    '[': "build_matrix_row bmatrix",
    '{': "build_matrix_row Bmatrix",
    '@': "build_matrix_row bmatrix 2;transpose_matrix",
    '#': "build_matrix_row bmatrix 3;transpose_matrix",
    '$': "build_matrix_row bmatrix 2;unrot;build_matrix_row bmatrix 2;swap;stack_arrays vertical",
    ':': "array_separator column dashed",
    '!': "array_separator column solid",
    '_': "array_separator row dashed",
    '-': "array_separator row solid",
    'Enter': "stack_arrays vertical"
  },

  build_matrix: {
    '[digit]': "prefix_argument",
    'm': "finish_build_matrix matrix",
    ' ': "finish_build_matrix matrix",
    'v': "finish_build_matrix vmatrix",
    'V': "finish_build_matrix Vmatrix",
    '(': "finish_build_matrix pmatrix",
    '[': "finish_build_matrix bmatrix",
    '{': "finish_build_matrix Bmatrix"
  },

  change_matrix_type: {
    'm': "change_matrix_type matrix",
    ' ': "change_matrix_type matrix",
    'v': "change_matrix_type vmatrix",
    'V': "change_matrix_type Vmatrix",
    '(': "change_matrix_type pmatrix",
    '[': "change_matrix_type bmatrix",
    '{': "change_matrix_type Bmatrix"
  },

  // [_] prefix: dissect mode
  // NOTE: The duplicate keybindings here are for the user's convenience
  // (e.g., capitals so they don't have to release the Shift key).
  dissect: {
    'default': "cancel_dissect_mode",
    //'Enter': "finish_dissect_mode",
    'Escape': "cancel_dissect_mode",
    'q': "cancel_dissect_mode",
    'Q': "cancel_dissect_mode",
    'Tab': "dissect_undo",
    'Ctrl+z': "dissect_undo",
    '_': "dissect_descend",
    'u': "dissect_ascend",
    'U': "dissect_ascend",
    'ArrowUp': "dissect_ascend",
    'ArrowDown': "dissect_descend",
    'ArrowLeft': "dissect_move_selection left",
    'ArrowRight': "dissect_move_selection right",
    '[': "dissect_move_selection left",
    '{': "dissect_move_selection left",
    ']': "dissect_move_selection right",
    '}': "dissect_move_selection right",
    'x': "dissect_extract_selection",
    'X': "dissect_extract_selection",
    'd': "dissect_extract_selection trim",
    'D': "dissect_extract_selection trim",
    'Backspace': "dissect_extract_selection trim",
    "'": "dissect_extract_selection",
    'c': "dissect_copy_selection",
    'C': "dissect_copy_selection",
    't': "dissect_copy_selection trim",
    'T': "dissect_copy_selection trim"
  },

  // [#] prefix: symbolic algebra mode
  algebrite: {
    '#': "algebrite eval",
    '=': "rationalize",  // not part of Algebrite
    '*': "algebrite conj",
    'A': "algebrite arg",
    'c': "algebrite_completesquare true",
    'C': "algebrite_completesquare false",
    'd': "algebrite derivative 1 1",
    'D': "algebrite derivative 2",
    'e': "algebrite circexp",
    'f': "algebrite factor 1 1",
    'F': "algebrite factor 2",
    'i': "algebrite integral 1 1",
    'I': "algebrite integral 2",
    'j': "algebrite defint 3 1",
    'J': "algebrite defint 4",
    'm': "algebrite sum 3 1",
    'n': "algebrite float",
    'M': "algebrite sum 4",
    'o': "algebrite product 3 1",
    'O': "algebrite product 4",
    'p': "mode algebrite_polynomial",
    'P': "algebrite polar",
    'q': "algebrite_check",
    'Q': "algebrite_check true",
    'r': "algebrite rationalize",
    'R': "algebrite rect",
    's': "algebrite simplify",
    't': "push 7;push 0;algebrite taylor 3 1",
    'T': "swap;algebrite taylor 4",  // NOTE: last two arguments are swapped
    'v': "algebrite eigenval",
    'V': "algebrite eigenvec;transpose_matrix",
    'w': "algebrite eval 2 1",
    'W': "algebrite eval 3",
    'x': "algebrite expand 1 1",
    'X': "algebrite expand 2",
    'y': "all_on_left true;algebrite nroots 1 1",  // TODO: display the guessed variable: x=[...] (for roots() too)
    'Y': "swap;all_on_left true;swap;algebrite nroots 2",
    'z': "all_on_left true;algebrite roots 1 1",
    'Z': "swap;all_on_left true;swap;algebrite roots 2"
  },

  algebrite_polynomial: {
    'p': "push x;swap;algebrite legendre 2",
    'P': "push x;unrot;algebrite legendre 3",
    'l': "push x;swap;algebrite laguerre 2",
    'L': "push x;unrot;algebrite laguerre 3",
    'h': "push x;swap;algebrite hermite 2",
    'j': "push x;swap;algebrite besselj 2",
    'y': "push x;swap;algebrite bessely 2"
  },

  // [@] prefix
  calligraphic: {
    '[alpha]': "self_push;to_case uppercase;typeface calligraphic",
    '@': "push @"  // undocumented
  },

  // [%] prefix
  blackboard: {
    '[alpha]': "self_push;to_case uppercase;typeface blackboard",
    'k': "push k;typeface blackboard",  // there's (only) a lowercase k in LaTeX (aka \Bbbk).
    '%': "push \\%"  // undocumented
  },

  // [&] prefix
  script: {
    '[alpha]': "self_push;to_case uppercase;typeface script",
    '&': "push \\&"  // undocumented
  },

  // [;] prefix: lowercase Greek letters
  lowercase_greek: {
    'a': "push \\alpha",     'b': "push \\beta",
    'c': "push \\xi",        'd': "push \\delta",
    'e': "push \\epsilon",   'f': "push \\phi",
    'g': "push \\gamma",     'h': "push \\eta",
    'i': "push \\iota",      'j': "push \\varphi",
    'k': "push \\kappa",     'l': "push \\lambda",
    'm': "push \\mu",        'n': "push \\nu",
    'o': "push \\omega",     'p': "push \\pi",
    'q': "push \\vartheta",  'r': "push \\rho",
    's': "push \\sigma",     't': "push \\tau",
    'u': "push \\upsilon",   'v': "push \\theta",
    'w': "push \\omega",     'x': "push \\chi",
    'y': "push \\psi",       'z': "push \\zeta",

    ':': "mode variant_greek",
    ';': "infix semicolon"
  },

  // [:] prefix: uppercase Greek letters
  uppercase_greek: {
    'a': "push A",            'b': "push B",
    'c': "push \\Xi",         'd': "push \\Delta",
    'e': "push \\varepsilon", 'f': "push \\Phi",
    'g': "push \\Gamma",      'h': "push \\mho",
    'i': "push I",            'j': "push \\Phi",
    'k': "push \\varkappa",   'l': "push \\Lambda",
    'm': "push \\varpi",      'n': "push \\nabla",
    'o': "push \\Omega",      'p': "push \\Pi",
    'q': "push \\Theta",      'r': "push \\varrho",
    's': "push \\Sigma",      't': "push \\varsigma",
    'u': "push \\Upsilon",    'v': "push \\Theta",
    'w': "push \\Omega",      'x': "push X",
    'y': "push \\Psi",        'z': "push Z",
    /*'6': "push \\digamma",   '^': "push \\digamma",*/

    // TODO: support for case-insensitive keybindings in general
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

    ':': "infix \\colon"
  },

  // [:][;] prefix: "variant" uppercase Greek letters
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
    'y': "push \\varPsi",      'Y': "push \\varPsi"
  }
};


export default EditorKeymap;
