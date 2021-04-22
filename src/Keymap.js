
const EditorKeymap = {
    base: {
	// Self-insert keys
	'[alnum]': "self_insert",
	'!': "insert !;concat",
	'#': "insert \\#",
	'@': "insert @",
	'^': "superscript",
	'*': "insert *",
	'~': "insert \\sim",

	// Other Ctrl-based shortcuts
	'Ctrl+0': "insert 0;subscript",
	'Ctrl+1': "insert -1;superscript",
	'Ctrl+2': "insert 2;superscript",
	'Ctrl+3': "insert 3;superscript",
	'Ctrl+4': "insert 4;superscript",
	'Ctrl+a': "swap",
	'Ctrl+c': "copy_to_clipboard",
	'Ctrl+e': "name exp;insert e;operator mathrm;swap;superscript",  // exp(x) - same as [/] [e]
	'Ctrl+i': "pop_to_document",
	'Ctrl+j': "extract_from_document",
	'Ctrl+k': "infix \\,",
	'Ctrl+l': "recenter_document 50",
	'Ctrl+m': "prefix -",
	'Ctrl+o': "name apply_fn;parenthesize;swap;operator mathopen;swap;concat",  // same as [/] [o]
	'Ctrl+p': "delimiters ( )",
	'Ctrl+s': "save_file",
	'Ctrl+u': "superscript",
	'Ctrl+v': "paste_from_clipboard",
	'Ctrl+y': "redo",
	'Ctrl+z': "undo",
	'Ctrl+ ': "infix \\,",

	// Immediate action special keys
	'Shift+Enter': "edit_stack_top",
	' ': "concat autoparenthesize",
	'=': "mode relational",
	'<': "delimiters \\langle \\rangle",
	'+': "infix_plus_or_minus +",
	'-': "infix_plus_or_minus -",
	']': "operator boldsymbol",
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

	// Prefix keys
	'Tab': "mode stack",
	'Enter': "subscript",
	'Backspace': "pop",
	"`": "superscript",
	"'": "mode symbol",
	'.': "mode decoration",
	',': "mode infix",
	')': "mode delimiters",
	'}': "custom_delimiter",
	';': "mode lowercase_greek",
	':': "mode uppercase_greek",
	'%': "mode calligraphic",
	'&': "mode script",
	'/': "mode operator",
	'_': "accumulate text",
	"\\": "accumulate latex",
	'|': "mode array",
	'$': "mode config",
	'?': "toggle_popup help",
	"\"": "edit_new_item"
    },

    files: {
	'default': "toggle_popup files",
	
	'd': "delete_selected_file",
	'n': "start_new_file",
	'Enter': "load_selected_file",
	's': "save_file",
	'S': "save_file_as",
	'ArrowUp': "select_adjacent_file -1",
	'ArrowDown': "select_adjacent_file 1"
    },

    keymap: {
	'ArrowUp': 'scroll_popup_panel -25',
	'ArrowDown': 'scroll_popup_panel 25',
	'default': "toggle_popup keymap"
    },

    help: {
	'ArrowUp': 'scroll_popup_panel -40',
	'ArrowDown': 'scroll_popup_panel 40',
	'default': "toggle_popup help"
    },

    // Tab prefix: stack/misc operations
    stack: {
	'c': "copy_to_clipboard",
	'd': "pop",
	'i': "pop_to_document",
	'I': "copy_to_document",
	'j': "extract_from_document",
	'J': "recall_from_document",
	'l': "recenter_document 50",
	'n': "nip",
	'o': "over",
	'p': "paste_from_clipboard",
	'r': "rot",
	't': "tuck",
	'u': "unrot",
	'v': "reverse_n",
	'V': "reverse_all",
	'w': "swap",
	'X': "clear_stack",
	'Enter': "dup",
	'Tab': "undo",
	'.': "redo",
	' ': "dup",

	// temporary
	'f': "toggle_popup files",
	'k': "toggle_popup keymap"
    },

    // $ prefix: configuration
    config: {
	// 'a': "mode config_aux",
	// 'c': "config alternate_layout",
	'm': "mode config_math_alignment",
	'r': "config reset_layout",
	's': "mode config_stack",
	't': "mode config_theme",
	'z': "mode config_zoom",

	'$': "insert \\$"
    },
    // $m
    config_math_alignment: {
	'd': "config math_align toggle_document",
	's': "config math_align toggle_stack"
    },
    // $s
    config_stack: {
	'0': "config stack_split 0",
	'1': "config stack_split 10",
	'2': "config stack_split 20",
	'3': "config stack_split 30",
	'4': "config stack_split 40",
	'5': "config stack_split 50",
	'6': "config stack_split 60",
	'7': "config stack_split 70",
	'8': "config stack_split 80",
	'9': "config stack_split 90",
	'*': "config stack_split 100",

	'ArrowLeft': "config stack_side left",
	'ArrowRight': "config stack_side right",
	'ArrowUp': "config stack_side top",
	'ArrowDown': "config stack_side bottom"
    },
    // $t
    config_theme: {
	'0': "config theme default",
	'1': "config theme dawn",
	'2': "config theme dusk",
	'3': "config theme dark"
    },
    // $z
    config_zoom: {
	'0': "config zoom_factor 0",
	'+': "config zoom_factor +",
	'-': "config zoom_factor -"
    },

    // " and \ prefixes (text/latex accumulator)
    accumulate: {
	'Enter': "finish_text_input",
	'Shift+Enter': "finish_text_input roman",
	'Escape': "pop",  // (cancel text input)
	'Backspace': "backspace_text_input",
	'default': "append_text_input"
    },

    // right-bracket prefix: special delimiters
    delimiters: {
	'b': "delimiters \\langle \\vert",  //  <x| Dirac bra
	'c': "delimiters \\lceil \\rceil",
	'f': "delimiters \\lfloor \\rfloor",
	'g': "delimiters \\lgroup \\rgroup",
	'i': "delimiters \\langle \\rangle \\vert 2",  // <x|y>; mnemonic: [i]nner product
	'I': "delimiters \\langle \\rangle \\vert 3",  // <x|y|z>
	'k': "delimiters \\vert \\rangle",  // |x> Dirac ket
	'm': "delimiters \\lmoustache \\rmoustache",
	'n': "delimiters \\lVert \\rVert",  // n = Norm
	'w': "delimiters . \\vert",  // "where"
	'|': "delimiters \\vert \\vert",
	'<': "delimiters \\langle \\rangle",
	'(': "delimiters ( )",
	'[': "delimiters [ ]",
	']': "name doublebrackets;insert \\llbracket;swap;concat;insert \\rrbracket;concat",
	'{': "delimiters \\{ \\}"
    },

    // right-curly-brace prefix: custom delimiter builder mode
    custom_delimiters: {
	'1': "custom_delimiter_arity 1",
	'2': "custom_delimiter_arity 2",
	'3': "custom_delimiter_arity 3",
	'4': "custom_delimiter_arity 4",
	'5': "custom_delimiter_arity 5",
	'6': "custom_delimiter_arity 6",
	'7': "custom_delimiter_arity 7",
	'8': "custom_delimiter_arity 8",
	'9': "custom_delimiter_arity 9",
	'c': "custom_delimiter \\lceil",
	'C': "custom_delimiter \\rceil",
	'f': "custom_delimiter \\lfloor",
	'F': "custom_delimiter \\rfloor",
	'g': "custom_delimiter \\lgroup",
	'G': "custom_delimiter \\rgroup",
	'm': "custom_delimiter \\lmoustache",
	'M': "custom_delimiter \\rmoustache",
	'v': "custom_delimiter \\Vert",
	'<': "custom_delimiter \\langle",
	'>': "custom_delimiter \\rangle",
	'(': "custom_delimiter (",
	')': "custom_delimiter )",
	'[': "custom_delimiter [",
	']': "custom_delimiter ]",
	'{': "custom_delimiter \\{",
	'}': "custom_delimiter \\}",
	'.': "custom_delimiter .",
	'/': "custom_delimiter /",
	"\\": "custom_delimiter \\backslash",
	'|': "custom_delimiter |"
    },

    // forward-slash prefix: assorted functions/operators
    operator: {
	'1': "name reciprocal;insert 1;swap;operator frac 2",
	'2': "mode squared",
	'a': "apply_operator 1",
	'A': "apply_operator 2",
	'b': "operator binom 2",
	'c': "named_function cos",
	'C': "named_function csc",
	'd': "mode derivative",
	'D': "named_function det",
	'e': "name exp;insert e;operator mathrm;swap;superscript",  // exp(x)
	'E': "named_function exp",
	'f': "delimiters . . / 2",  // NOTE: duplicates [,f]
	'g': "named_function argmin",
	'G': "named_function argmax",
	'h': "mode hyperbolic",
	'i': "mode integral_limits",
	'l': "name lim;insert \\limits;swap;subscript;insert \\lim;swap;concat",  // lim_{x}
	'm': "named_function min",
	'M': "named_function max",
	'n': "named_function ln",
	'N': "named_function log",
	'o': "name apply_fn;parenthesize;swap;operator mathopen;swap;concat",   // f x -> f(x)  "of"; \mathopen closes up the spacing after 'f'
	'p': "parenthesize;operator Pr",  // Pr(x) (probability)
	'P': "operator phase",
	'q': "operator sqrt",
	'Q': "operator sqrt[3]",
	's': "named_function sin",
	'S': "named_function sec",
	't': "named_function tan",
	'T': "named_function cot",
	'u': "name inf;insert \\limits;swap;subscript;insert \\inf;swap;concat",
	'U': "name sup;insert \\limits;swap;subscript;insert \\sup;swap;concat",
	'v': "name Var;parenthesize;insert Var;operator operatorname;swap;concat",
	'V': "name Cov;swap;insert ,;concat;swap;concat;parenthesize;insert Cov;operator operatorname;swap;concat",
	';': "apply_tag",
	'/': "operator frac 2",
	"\\": "operator tfrac 2",
	'}': "name underbrace;swap;operator underbrace;swap;subscript",
	'{': "name overbrace;swap;operator overbrace;swap;superscript",
	'-': "mode inverse",
	"'": "substitute_defer",
	'Enter': "name subsuperscript;unrot;subscript;swap;superscript"  // apply superscript and subscript at once
    },

    // TODO: maybe make a more general way of doing these
    hyperbolic: {
	's': "named_function sinh",
	'S': "named_function sech",
	'c': "named_function cosh",
	'C': "named_function csch",
	't': "named_function tanh",
	'T': "named_function coth"
    },
    inverse: {
	's': "named_function sin -1",
	'S': "named_function sec -1",
	'c': "named_function cos -1",
	'C': "named_function csc -1",
	't': "named_function tan -1",
	'T': "named_function cot -1",
	'h': "mode inverse_hyperbolic"
    },
    inverse_hyperbolic: {
	's': "named_function sinh -1",
	'S': "named_function sech -1",
	'c': "named_function cosh -1",
	'C': "named_function csch -1",
	't': "named_function tanh -1",
	'T': "named_function coth -1"
    },
    squared: {
	's': "named_function sin 2",
	'S': "named_function sec 2",
	'c': "named_function cos 2",
	'C': "named_function csc 2",
	't': "named_function tan 2",
	'T': "named_function cot 2",
	'h': "mode squared_hyperbolic"
    },
    squared_hyperbolic: {
	's': "named_function sinh 2",
	'S': "named_function sech 2",
	'c': "named_function cosh 2",
	'C': "named_function csch 2",
	't': "named_function tanh 2",
	'T': "named_function coth 2"
    },

    // /i prefix
    integral_limits: {
	'r': "name limits_real;insert -\\infty;subscript;insert \\infty;superscript",  // -oo .. oo : [r]eals
	'n': "name limits_negative;insert -\\infty;subscript;insert 0;superscript",  // -oo .. o : [n]egative 
	'p': "name limits_positive;insert 0;subscript;insert \\infty;superscript",  // 0..oo : [p]ositive
	'u': "name limits_unit;insert 0;subscript;insert 1;superscript",  // 0..1 : [u]nit
	't': "name limits_trig;insert 0;subscript;insert 2\\pi;superscript",  // 0..2pi : [t]rigonometric
	'T': "name limits_sym_trig;insert -\\pi;subscript;insert \\pi;superscript"  // -pi..pi : symmetric [T]rigonometric
    },

    // /d prefix: derivative operations
    derivative: {
	// \partial y / \partial x
	'j': "name partial_yx;insert \\partial;swap;concat;swap;insert \\partial;swap;concat;swap;operator frac 2",
	// \partial^2 y / \partial x^2
	'J': "name partial2_yx;insert 2;superscript;insert \\partial;swap;concat;swap;insert \\partial;insert 2;superscript;swap;concat;swap;operator frac 2",
	// dy/dx
	'k': "name dy_dx;insert d;swap;concat;swap;insert d;swap;concat;swap;operator frac 2",
	// d^2(y) / dx^2
	'K': "name d2_y_dx2;insert 2;superscript;insert d;swap;concat;swap;insert d;insert 2;superscript;swap;concat;swap;operator frac 2",
	// \partial / \partial x
	'q': "name partial_x;insert \\partial;swap;concat;insert \\partial;swap;operator frac 2",
	// \partial^2 / \partial x^2
	'Q': "name partial2_x2;insert 2;superscript;insert \\partial;swap;concat;insert \\partial;insert 2;superscript;swap;operator frac 2",
	// d/dx
	'x': "name d_dx;insert d;swap;concat;insert d;swap;operator frac 2",
	// d^2 / dx^2
	'X': "name d2_dx2;insert 2;superscript;insert d;swap;concat;insert d;insert 2;superscript;swap;operator frac 2",
	// \partial^2 / \partial x\,\partial y
	'm': "name partial2_x_y;insert \\partial;swap;concat;insert \\partial;rot;concat;swap;insert \\,;swap;concat;concat;insert \\partial;insert 2;superscript;swap;operator frac 2",
	// \partial^2 z / \partial x\,\partial y
	'M': "name partial2_z_x_y;insert \\partial;swap;concat;insert \\partial;rot;concat;swap;insert \\,;swap;concat;concat;swap;insert \\partial;insert 2;superscript;swap;concat;swap;operator frac 2",
	// gradient
	'g': "name gradient;insert \\nabla;swap;concat",
	// divergence
	'd': "name divergence;insert \\nabla;insert \\cdot;concat;swap;concat",
	// curl
	'c': "name curl;insert \\nabla;insert \\times;concat;swap;concat",
	// Laplacian
	'l': "name laplacian;insert \\nabla;insert 2;superscript;swap;concat"
    },

    // comma prefix: combine two objects with an infix operation
    infix: {
	'a': "apply_infix",
	'b': "infix \\bullet",
	'c': "infix \\cap",
	'd': "infix \\setminus",  // (set [d]ifference)
	'g': "infix \\gets",
	'k': "delimiters . . \\vert 2",  // alias for | ([k]onditional)
	'm': "infix \\mapsto",
	'M': "infix \\mp",
	'o': "infix \\circ",
	'O': "stackrel overset",
	'P': "infix \\pm",
	's': "infix \\,",
	't': "infix \\to",
	'u': "infix \\cup",
	'U': "stackrel underset",
	'v': "infix \\vee",
	'w': "infix \\wedge",
	'x': "infix \\times",
	'X': "infix \\otimes",
	'[': "infix \\llcorner",  // right-contraction
	']': "infix \\lrcorner",  // left-contraction
	'|': "delimiters . . \\vert 2",  // "infix |",
	'=': "infix \\Rightarrow",
	'-': "infix \\ominus",
	'+': "infix \\oplus",
	'.': "infix \\cdot",
	',': "infix ,",  // comma without thinspace
	' ': "infix ,\\,",  // comma plus thinspace
	':': "infix :",
	';': "infix semicolon\\:",
	'%': "infix \\pmod",  // y (mod x)
	'*': "infix *",
	"\\": "delimiters . . / 2",
	'/': "infix /"
    },

    relational: {
	'a': "infix \\approx",
	'c': "infix \\cong",  // =~  congruent
	'e': "infix \\equiv",
	'E': "infix \\iff",
	'g': "infix >",
	'G': "infix \\gg",
	'i': "infix \\in",
	'I': "infix \\notin",
	'l': "infix <",
	'L': "infix \\ll",
	'n': "infix \\ne",
	'p': "infix \\propto",
	'q': "infix =",
	's': "infix \\subseteq",
	'S': "infix \\subset",
	'=': "infix =",
	'<': "infix <",
	'>': "infix >",
	'[': "infix \\le",
	']': "infix \\ge",
	':': "infix \\coloneqq",
	'~': "infix \\sim"
    },

    // apostrophe prefix: assorted standalone math symbols
    symbol: {
	'0': "insert \\varnothing",
	'1': "insert -1",
	'2': "name half_display;insert 1;insert 2;operator frac 2",  // 1/2 (display)
	'3': "name half_inline;insert 1;insert 2;infix /",  // 1/2 (inline)
	'8': "insert \\infty",
	'a': "insert \\forall",
	'c': "insert \\cdot",
	'C': "insert \\bigcap",
	'd': "insert \\partial",
	'e': "insert \\exists",
	'h': "insert \\hslash",
	'i': "insert \\int",
	'I': "insert \\iint",
	'l': "insert \\ell",
	'M': "insert \\mp",
	'o': "insert \\circ",
	'p': "insert \\prod",
	'P': "insert \\pm",
	'q': "insert ?",
	's': "insert \\sum",
	't': "insert \\intercal",
	'T': "insert \\triangle",
	'U': "insert \\bigcup",
	'v': "insert \\vee",
	'w': "insert \\wedge",
	'y': "insert \\oint",
	'Y': "insert \\oiint",
	'.': "insert \\dots",
	'>': "insert \\cdots",
	'-': "insert -",
	'+': "insert +",
	'*': "insert \\star",
	'|': "insert |",
	'=': "insert_markdown ---",
	'?': "insert ?",
	'!': "insert !",
	',': "insert ,",
	';': "insert semicolon",
	':': "insert :",
	'`': "insert `",
	"'": "insert_defer",
	' ': "insert ",  // "nothing", e.g. when you don't want something on one side of an infix
	'ArrowUp': "insert \\uparrow",
	'ArrowDown': "insert \\downarrow"
    },

    // . prefix: expression decorators (fonts, hats, etc)
    decoration: {
	'1': "insert -1;superscript",  // raise to -1 power
	'a': "operator overrightarrow",  // TODO: [R] maybe instead
	'b': "operator mathbb",
	'c': "mode color",
	'd': "insert \\dagger;superscript",
	'D': "insert \\ddagger;superscript",
	'e': "operator bold",  // bold roman (sort of)
	'f': "prefix \\therefore",
	'F': "prefix \\because",
	'g': "operator mathring",
	'h': "apply_hat hat",
	'H': "apply_hat widehat",
	'k': "operator mathfrak",
	'l': "insert \\parallel;subscript",
	'm': "operator mathtt",
	'M': "prefix \\mp",
	'o': "operator bar",
	'O': "operator overline",
	'p': "insert \\perp;subscript",
	'P': "prefix \\pm",
	'r': "operator mathrm",
	's': "operator mathsf",  // sans-serif
	't': "prefix \\to",
	'T': "operator widetilde",
	'u': "apply_hat breve",
	'U': "operator utilde",
	'v': "operator vec",
	'V': "apply_hat check",
	'W': "apply_hat widecheck",
	'x': "operator boxed",
	'X': "operator sout",  // strikeout
	'.': "operator dot",
	"\"": "operator ddot",
	' ': "insert \\,;concat",  // append thin space
	"'": "autoparenthesize;prime",
	'*': "insert *;superscript",
	'~': "apply_hat tilde",
	'=': "prefix \\Rightarrow",
	'-': "prefix -",
	'+': "prefix +",
	'`': "operator grave",
	'/': "operator cancel",
	"\\": "operator bcancel",
	'_': "operator underline"
    },

    // .c prefix: set colors
    color: {
	'b': "color blue",
	'g': "color green",
	'h': "color #888",  // grey: [h]alf black
	'k': "color black",
	'o': "color orange",
	'p': "color purple",
	'r': "color red",
	'y': "color #ff0"
    },

    // | prefix: array/matrix operations
    array: {
	'a': "build_align aligned",
	'c': "build_align cases",
	'C': "build_align rcases",
	'd': "dissolve_matrix",
	'e': "name ellipsis_list;build_list ,\\,;insert ,\\,\\dots;concat",
	'E': "insert_matrix_ellipses",
	'g': "build_align gathered",
	'k': "build_substack",
	'm': "build_matrix_row matrix",
	'p': "name plus_list;build_list +;insert +\\cdots;concat",
	's': "split_matrix",
	'T': "matrix_transpose",
	'v': "build_matrix_row vmatrix",
	'V': "build_matrix_row Vmatrix",
	'|': "stack_matrices",
	',': "build_list ,",
	' ': "build_list ,\\,",
	'.': "name ellipsis_list_2;build_list ,\\, ,\\,\\dots,\\,",
	';': "build_list semicolon\\,",
	'+': "name plus_list_2;insert +;swap;build_infix_list \\cdots ",
	'Enter': "stack_matrices",
	'(': "build_matrix_row pmatrix",
	'[': "build_matrix_row bmatrix",
	'{': "build_matrix_row Bmatrix"
    },

    editor: {
	'Tab': "finish_editing",
	'Shift+Enter': "finish_editing",
	// TODO: use ArrowUp for the following when in layouts where stack is on bottom
	'Shift+ArrowDown': "import_item_into_editor",
	'Escape': "cancel_editing",
    },

    script: {
	'[alpha]': "name mathscr_letter;self_insert;to_case uppercase;operator mathscr",
	'&': "insert \\&"
    },

    calligraphic: {
	'[alpha]': "name mathcal_letter;self_insert;to_case uppercase;operator mathcal",
	'%': "insert \\%"
    },

    // ; prefix: lowercase Greek letters
    lowercase_greek: {
	'a': "insert \\alpha",     'b': "insert \\beta",
	'c': "insert \\chi",       'd': "insert \\delta",
	'e': "insert \\epsilon",   'f': "insert \\phi",
	'g': "insert \\gamma",     'h': "insert \\eta",
	'i': "insert \\iota",      'j': "insert \\varphi",
	'k': "insert \\kappa",     'l': "insert \\lambda",
	'm': "insert \\mu",        'n': "insert \\nu",
	'o': "insert \\omega",     'p': "insert \\pi",
	'q': "insert \\vartheta",  'r': "insert \\rho",
	's': "insert \\sigma",     't': "insert \\tau",
	'u': "insert \\upsilon",   'v': "insert \\theta",
	'w': "insert \\omega",     'x': "insert \\xi",
	'y': "insert \\psi",       'z': "insert \\zeta",

	';': "infix semicolon"
    },
    // : prefix: uppercase Greek letters
    uppercase_greek: {
	'd': "insert \\Delta",     'e': "insert \\varepsilon",
	'f': "insert \\Phi",       'g': "insert \\Gamma",
	'l': "insert \\Lambda",    'm': "insert \\varpi",
	'o': "insert \\Omega",     'p': "insert \\Pi",
	'q': "insert \\vartheta",  'r': "insert \\varrho",
	's': "insert \\Sigma",     't': "insert \\varsigma",
	'u': "insert \\Upsilon",   'v': "insert \\Theta",
	'w': "insert \\Omega",     'x': "insert \\Xi",
	'y': "insert \\Psi",
	'n': "insert \\nabla",  // special case

	// TODO: case-insensitive keybindings
	'D': "insert \\Delta",     'E': "insert \\varepsilon",
	'F': "insert \\Phi",       'G': "insert \\Gamma",
	'L': "insert \\Lambda",    'M': "insert \\varpi",
	'O': "insert \\Omega",     'P': "insert \\Pi",
	'Q': "insert \\vartheta",  'R': "insert \\varrho",
	'S': "insert \\Sigma",     'T': "insert \\varsigma",
	'U': "insert \\Upsilon",   'V': "insert \\Theta",
	'W': "insert \\Omega",     'X': "insert \\Xi",
	'Y': "insert \\Psi",
	'N': "insert \\nabla",

	':': "infix :"
    }
};


export default EditorKeymap;
