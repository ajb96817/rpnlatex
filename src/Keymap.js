
const EditorKeymap = {
    base: {
        // Letters/numbers and some symbols immediately push onto the stack
        '[alnum]': "self_push",
        '#': "push \\#",
        '@': "push @",
        '*': "push *",
        '~': "push \\sim",

        // Immediate action special keys
        '!': "autoparenthesize;push !;concat",
        'Enter': "subscript",
	'Shift+Enter': "edit_item",
        //'_': "start_dissect_mode",
        '^': "superscript",
        'Backspace': "pop",
        "`": "superscript",
        ' ': "autoparenthesize 2;concat",
        '=': "mode relational",
        '<': "infix <",
        '>': "infix >",
        '+': "infix +",
        '-': "infix -",
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

        // Stack scrolling commands
        'ArrowRight': "scroll stack_panel horizontal 75",
        'ArrowLeft': "scroll stack_panel horizontal -75",

        // Prefix keys
        'Tab': "mode stack",
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
        "\\": "start_text_entry math_text_entry",
        "\"": "start_text_entry text_entry",
        '|': "mode array",
        '$': "mode config",
        '?': "toggle_popup help",

        // Other Ctrl-based shortcuts
        'Ctrl+0': "push 0;subscript",
        'Ctrl+1': "push -1;superscript",
        'Ctrl+2': "push 2;superscript",
        'Ctrl+3': "push 3;superscript",
        'Ctrl+4': "push 4;superscript",
        'Ctrl+a': "swap",
        'Ctrl+b': "make_bold",
        'Ctrl+c': "copy_to_clipboard",
        'Ctrl+e': "push e;operator mathrm;swap;superscript",  // exp(x) - same as [/][e]
        'Ctrl+i': "pop_to_document",
        'Ctrl+j': "extract_from_document",
        'Ctrl+k': "infix \\,",
        'Ctrl+l': "recenter_document 50",
        'Ctrl+m': "prefix -",
        'Ctrl+o': "parenthesize;wrap_braces;concat",  // -> f(x): same as [/][o]
        'Ctrl+p': "delimiters ( )",
        'Ctrl+r': "infix ,;parenthesize;wrap_braces;concat",  // -> f(x,y): same as [/][r]
        'Ctrl+s': "save_file",
        'Ctrl+u': "superscript",
        'Ctrl+v': "paste_from_clipboard",
        'Ctrl+y': "redo",
        'Ctrl+z': "undo",
        'Ctrl+ ': "infix \\,",
        'Ctrl+,': "infix ,",
        'Ctrl+ArrowRight': "scroll document_container horizontal 75",
        'Ctrl+ArrowLeft': "scroll document_container horizontal -75",
        'Ctrl+/': "operator frac 2"
    },

    // File Manager mode
    files: {
        'default': "toggle_popup files",
        'd': "delete_selected_file",
        'n': "start_new_file",
        'Enter': "load_selected_file",
        's': "save_file",
        'S': "save_file_as",
        'ArrowUp': "select_adjacent_file -1",
        'ArrowDown': "select_adjacent_file 1",
        // undocumented: j/k for scrolling the panel itself
        'j': 'scroll popup_panel vertical 25',
        'k': 'scroll popup_panel vertical -25',
    },

    // User Manual mode
    help: {
        'ArrowDown': 'scroll popup_panel vertical 25',
        'ArrowUp': 'scroll popup_panel vertical -25',
        'j': 'scroll popup_panel vertical 25',
        'k': 'scroll popup_panel vertical -25',
        'ArrowLeft': 'cancel',
        'ArrowRight': 'cancel',
        'PageUp': 'scroll popup_panel vertical -95',
        'PageDown': 'scroll popup_panel vertical 95',
        'default': "toggle_popup help"
    },

    // Tab prefix: stack/misc operations
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
        'l': "recenter_document 50",
        'n': "nip",
        'o': "over",
        'r': "rot",
        's': "save_file",
        't': "tuck",
        'u': "unrot",
        'v': "paste_from_clipboard",
        'X': "reset_all",
        'Enter': "dup",
        'Backspace': "pop",
        'Tab': "undo",
        '.': "redo",
        '!': "export_document_as_text",
        '@': "export_stack_items_as_text",
        '$': "extract_latex_source",
        'ArrowRight': "scroll document_container horizontal 75",
        'ArrowLeft': "scroll document_container horizontal -75",
        '?': "toggle_popup help stack"
    },

    // $ prefix: configuration
    config: {
        '[digit]': "prefix_argument",
        '*': "prefix_argument",
        'ArrowLeft': "config stack_side left",
        'ArrowRight': "config stack_side right",
        'ArrowUp': "config stack_side top",
        'ArrowDown': "config stack_side bottom",
        'f': "fullscreen on",
        'F': "fullscreen off",
        'i': "config toggle_inline_math",
	'I': "config toggle_mode_indicator",
        'm': "config math_align toggle_document",
        'M': "config math_align toggle_stack",
        'r': "config reset_layout",
        's': "config stack_split",
        't': "config theme",
        'z': "config zoom_factor increase",
        'Z': "config zoom_factor decrease",
        '$': "push \\$",
        '!': "push \\alpha\\boldsymbol{\\alpha}\\mathcal{A}\\mathfrak{A}A\\bold{A}\\boldsymbol{A}\\mathtt{A}\\mathrm{A}\\mathsf{A}\\textup{A}\\Bbb{A}\\mathscr{A}[\\big[\\Big[\\bigg[\\Bigg[\\int",
        '?': "toggle_popup help configuration"
    },

    // " prefix (TextItem text)
    text_entry: {
        'Enter': "finish_text_entry text",
        'Shift+Enter': "finish_text_entry heading",
        'Escape': "cancel_text_entry",
        'Ctrl+z': "cancel_text_entry",
        'Backspace': "backspace_text_entry",
        'default': "append_text_entry"
    },

    // \ prefix (math text)
    math_text_entry: {
        'Enter': "finish_text_entry math",
        'Shift+Enter': "finish_text_entry roman_math",
        "\\": "start_text_entry latex_entry",
        'Escape': "cancel_text_entry",
        'Ctrl+z': "cancel_text_entry",
        'Backspace': "backspace_text_entry",
        'default': "append_text_entry"
    },

    // double \ prefix (latex command)
    latex_entry: {
        'Enter': "finish_text_entry latex",
        'Escape': "cancel_text_entry",
        'Ctrl+z': "cancel_text_entry",
        'Backspace': "backspace_text_entry math_text_entry",
        'default': "append_text_entry"
    },

    // right-parenthesis prefix: special delimiters
    delimiters: {
        'b': "delimiters \\langle \\vert",  // <x| Dirac bra
        'c': "delimiters \\lceil \\rceil",
        'f': "delimiters \\lfloor \\rfloor",
        'g': "delimiters \\lgroup \\rgroup",
        'i': "delimiters \\langle \\rangle \\vert 2",  // <x|y>; mnemonic: [i]nner product
        'I': "delimiters \\langle \\rangle \\vert 3",  // <x|y|z>
        'k': "delimiters \\vert \\rangle",  // |x> Dirac ket
        'm': "delimiters \\lmoustache \\rmoustache",
        'n': "delimiters \\lVert \\rVert",  // n = Norm
        'N': "delimiters \\lVert \\rVert",  // alias for n
        'w': "delimiters . \\vert",  // "where"
        'W': "delimiters . \\vert",  // alias for w
        '|': "delimiters \\vert \\vert",
        '<': "delimiters \\langle \\rangle",
        '(': "delimiters ( )",
	')': "toggle_fixed_size_delimiters",
        '[': "delimiters [ ]",
        ']': "push \\llbracket;swap;concat;push \\rrbracket;concat",
        '{': "delimiters \\{ \\}",
        '?': "toggle_popup help delimiters"
    },

    // right-curly-brace prefix: custom delimiter builder mode
    custom_delimiters: {
        '[digit]': "prefix_argument",
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
        ' ': "custom_delimiter .",
        '/': "custom_delimiter /",
        "\\": "custom_delimiter \\backslash",
        '|': "custom_delimiter |",
        '?': "toggle_popup help delimiters"
    },

    // forward-slash prefix: assorted functions/operators
    operator: {
        '1': "push 1;swap;operator frac 2",
        '2': "mode squared",
        'a': "apply_operator 1",
        'A': "apply_operator 2",
        'b': "operator binom 2",
        'c': "named_function cos",
        'C': "named_function csc",
        'd': "mode derivative",
        'D': "named_function det",
        'e': "push e;operator mathrm;swap;superscript",  // exp(x)
        'E': "named_function exp",
        'f': "mode named_operator",
        'h': "mode hyperbolic",
        'i': "mode integral_limits",
        'I': "push \\int;swap;superscript;swap;subscript",
        'k': "delimiters . . \\vert 2;parenthesize;wrap_braces;concat",  // f x y -> f(x|y)
        'l': "push \\limits;swap;subscript;push \\lim;swap;concat",  // lim_{x}
        'L': "infix \\to;push \\limits;swap;subscript;push \\lim;swap;concat",  // lim_{y \to x}
        'n': "named_function ln",
        'N': "named_function log",
        'o': "parenthesize;wrap_braces;concat",  // f x -> f(x)  "of" (wrap_braces closes up the spacing after 'f')
        'O': "overunderset overset",
        'p': "parenthesize;operator Pr",  // Pr(x) (probability)
        'P': "push \\,;swap;concat;swap;push \\,;concat;swap;delimiters . . \\vert 2;parenthesize;operator Pr",  // Pr(y|x)
        'q': "operator sqrt",
        'Q': "operator sqrt[3]",
        'r': "infix ,;parenthesize;wrap_braces;concat",  // f x y -> f(x,y)
        's': "named_function sin",
        'S': "named_function sec",
        't': "named_function tan",
        'T': "named_function cot",
        'U': "overunderset underset",
        'v': "parenthesize;push Var;operator operatorname;swap;concat",
        'V': "swap;push ,;concat;swap;concat;parenthesize;push Cov;operator operatorname;swap;concat",
	'w': "swap_infix",
        'x': "push E;operator mathbb;swap;delimiters [ ];wrap_braces;concat",  // E[x] (expectation)
        'X': "push \\,;swap;concat;swap;push \\,;concat;swap;delimiters . . \\vert 2;delimiters [ ];wrap_braces;push E;operator mathbb;swap;concat",  // E[y|x]
        'y': "push E;operator mathbb;swap;subscript;swap;delimiters [ ];wrap_braces;concat",  // E_x[y] (with subscript)
        'Y': "unrot;push \\,;swap;concat;swap;push \\,;concat;swap;delimiters . . \\vert 2;delimiters [ ];wrap_braces;swap;push E;operator mathbb;swap;subscript;swap;concat",  // E_x[z|y]
        ';': "apply_tag",
        ',': "split_infix",
        '/': "operator frac 2",
        '[': "delimiters [ ];wrap_braces;concat",  // f x -> f[x]
        ']': "delimiters \\{ \\};wrap_braces;concat",  // f x -> f{x}
        '}': "swap;operator underbrace;swap;subscript",
        '{': "swap;operator overbrace;swap;superscript",
        '<': "extract_infix_side left",
        '>': "extract_infix_side right",
        '-': "mode inverse",
        '=': "unrot;infix =;push \\sum;swap;subscript;swap;superscript",
        '+': "infix \\ge;push \\sum;swap;subscript",
        "'": "substitute_placeholder",
        "\"": "toggle_is_heading",
        'Enter': "unrot;subscript;swap;superscript",  // apply superscript and subscript at once
        '?': "toggle_popup help operators"
    },

    named_operator: {
        'a': "operator arg",
        'c': "operator gcd",
        'd': "operator dim",
        'e': "operator deg",
        'f': "operator liminf",
        'g': "operator argmax",
        'h': "operator hom",
        'i': "operator inf",
        'k': "operator ker",
        'l': "operator lim",
        'm': "operator min",
        'n': "operator argmin",
        'o': "push Cov;operator operatorname;swap;concat",
        'p': "operator Pr",
        'r': "push tr;operator operatorname;swap;concat",
        's': "operator sup",
        't': "operator det",
        'u': "operator limsup",
        'v': "push Var;operator operatorname;swap;concat",
        'x': "operator max",

        'A': "underset_operator arg",
        'C': "underset_operator gcd",
        'D': "underset_operator dim",
        'E': "underset_operator deg",
        'F': "underset_operator liminf",
        'G': "underset_operator argmax",
        'H': "underset_operator hom",
        'I': "underset_operator inf",
        'K': "underset_operator ker",
        'L': "underset_operator lim",
        'M': "underset_operator min",
        'N': "underset_operator argmin",
        'O': "underset_operator Cov true",
        'P': "underset_operator Pr",
        'R': "underset_operator tr true",
        'S': "underset_operator sup",
        'T': "underset_operator det",
        'U': "underset_operator limsup",
        'V': "underset_operator Var true",
        'X': "underset_operator max"
    },

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
    inverse_hyperbolic: {
        's': "named_function sinh -1",
        'S': "named_function sech -1",
        'c': "named_function cosh -1",
        'C': "named_function csch -1",
        't': "named_function tanh -1",
        'T': "named_function coth -1",
        '2': "mode squared_hyperbolic"
    },
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
    squared_hyperbolic: {
        's': "named_function sinh 2",
        'S': "named_function sech 2",
        'c': "named_function cosh 2",
        'C': "named_function csch 2",
        't': "named_function tanh 2",
        'T': "named_function coth 2",
        '-': "mode inverse_hyperbolic"
    },

    // /i prefix
    integral_limits: {
        'r': "push -\\infty;subscript;push \\infty;superscript",  // -oo..oo : [r]eals
        'n': "push -\\infty;subscript;push 0;superscript",  // -oo..0 : [n]egative 
        'p': "push 0;subscript;push \\infty;superscript",  // 0..oo : [p]ositive
        'u': "push 0;subscript;push 1;superscript",  // 0..1 : [u]nit
        'U': "push -1;subscript;push 1;superscript",  // -1..1 : symmetric [U]nit
        't': "push 0;subscript;push 2\\pi;superscript",  // 0..2pi : [t]rigonometric
        'T': "push -\\pi;subscript;push \\pi;superscript",  // -pi..pi : symmetric [T]rigonometric
        '?': "toggle_popup help integrals"
    },

    // /d prefix: derivative operations
    derivative: {
        // \partial y / \partial x
        'j': "push \\partial;swap;concat;swap;push \\partial;swap;concat;swap;operator frac 2",
        // \partial^2 y / \partial x^2
        'J': "push 2;superscript;push \\partial;swap;concat;swap;push \\partial;push 2;superscript;swap;concat;swap;operator frac 2",
        // dy/dx
        'k': "push d;operator mathrm;swap;concat;swap;push d;operator mathrm;swap;concat;swap;operator frac 2",
        // d^2(y) / dx^2
        'K': "push 2;superscript;push d;operator mathrm;swap;concat;swap;push d;operator mathrm;push 2;superscript;swap;concat;swap;operator frac 2",
        // \partial / \partial x
        'q': "push \\partial;swap;concat;push \\partial;swap;operator frac 2",
        // \partial^2 / \partial x^2
        'Q': "push 2;superscript;push \\partial;swap;concat;push \\partial;push 2;superscript;swap;operator frac 2",
        // d/dx
        'x': "push d;operator mathrm;swap;concat;push d;operator mathrm;swap;operator frac 2",
        // d^2 / dx^2
        'X': "push 2;superscript;push d;operator mathrm;swap;concat;push d;operator mathrm;push 2;superscript;swap;operator frac 2",
        // \partial^2 / \partial x\,\partial y
        'm': "push \\partial;swap;concat;push \\partial;rot;concat;swap;push \\,;swap;concat;concat;push \\partial;push 2;superscript;swap;operator frac 2",
        // \partial^2 z / \partial x\,\partial y
        'M': "push \\partial;swap;concat;push \\partial;rot;concat;swap;push \\,;swap;concat;concat;swap;push \\partial;push 2;superscript;swap;concat;swap;operator frac 2",
        // gradient
        'g': "push \\nabla;swap;concat",
        // gradient with respect to x
        'G': "push \\nabla;swap;subscript;swap;concat",
        // divergence
        '.': "push \\nabla;push \\cdot;concat;swap;concat",
        // curl
        'c': "push \\nabla;push \\times;concat;swap;concat",
        // Laplacian
        'l': "push \\nabla;push 2;superscript;swap;concat",
        // d'Alembertian
        'L': "push \\Box;push 2;superscript;swap;concat",
        // x -> dx
        'd': "push d;operator mathrm;swap;concat",
        // x -> d^2x
        '2': "push d;operator mathrm;push 2;superscript;swap;concat",
        '3': "push d;operator mathrm;push 3;superscript;swap;concat",
        '4': "push d;operator mathrm;push 4;superscript;swap;concat",
        // y x -> y dx
        'i': "swap;push \\,;concat;swap;push d;operator mathrm;swap;concat;concat",
        // y x -> ydx (with thinspace after the dx)
        'I': "push d;operator mathrm;swap;concat;concat;push \\,;concat",
        // y x -> ydx (no spacing around the dx)
        ' ': "push d;operator mathrm;swap;concat;concat",

        '?': "toggle_popup help derivatives"
    },

    // comma prefix: combine two objects with an infix operation
    infix: {
        'a': "apply_infix",
        'b': "infix \\bullet",
        'c': "infix \\cap",
        'd': "infix \\setminus",  // (set [d]ifference)
        'e': "infix ,\\dots,",
        'f': "conjunction if",
        'F': "conjunction iff",
        'g': "infix \\gets",
        'k': "push \\,;swap;concat;swap;push \\,;concat;swap;delimiters . . \\vert 2",  // x | y  ([k]onditional)
        'l': "infix \\parallel",
        'M': "infix \\mp",
        'n': "conjunction when",
        'o': "infix \\circ",
        'O': "infix \\odot",
        'p': "infix \\perp",
        'P': "infix \\pm",
        'q': "conjunction and",
        'Q': "conjunction or",
        'r': "conjunction for",
        's': "infix \\,",
        't': "infix \\to",
        'T': "infix \\longrightarrow",
        'u': "infix \\cup",
        'v': "infix \\vee",
        'V': "infix \\veebar",
        'w': "infix \\wedge",
        'W': "infix \\barwedge",
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
        '`': "swap;push T;superscript;swap;concat",  // xTy
        '%': "operator pmod;concat",  // y (mod x)
        '*': "infix *",
	'(': "infix ,;delimiters ( )",  // (x,y)
        '<': "infix ,;delimiters \\langle \\rangle",  // <x,y>
        '>': "infix \\cdots",
        '/': "autoparenthesize 2;delimiters . . / 2",  // flex x/y
        "\\": "autoparenthesize 2;infix /",  // fixed x/y
        '?': "toggle_popup help infix"
    },

    // = prefix: relational operators
    relational: {
	'9': "infix \\prec",
	'0': "infix \\succ",
        'a': "infix \\approx",
        'c': "infix \\cong",  // =~  congruent
        'e': "infix \\equiv",
        'E': "infix \\iff",
        'g': "infix >",
	'f': "infix \\Leftarrow", // "[f]rom"
        'G': "infix \\gg",
        'i': "infix \\in",
        'I': "infix \\notin",
	'j': "infix \\Join",
        'l': "infix <",
        'L': "infix \\ll",
        'm': "infix \\mapsto",
        'n': "infix \\ne",
        '!': "infix \\ne",
	'o': "infix \\circeq",
        'p': "infix \\propto",
        'q': "infix =",
        's': "infix \\subseteq",
        'S': "infix \\subset",
        't': "infix \\sim",
	'u': "infix \\supseteq",
	'U': "infix \\supset",
        '=': "infix =",
	'^': "infix \\triangleq",
        '<': "infix \\le",
        '>': "infix \\ge",
        '[': "infix \\le",
        ']': "infix \\ge",
	'{': "infix \\sqsubset",
	'}': "infix \\sqsupset",
	'(': "infix \\preceq",
	')': "infix \\succeq",
	'.': "infix \\doteq",
        ':': "infix \\coloneqq",
        ';': "infix \\coloncolon",
        '~': "infix \\sim",
	'-': "infix \\vdash",
        '|': "infix \\vDash",
        '?': "toggle_popup help relational"
    },

    // apostrophe prefix: assorted standalone math symbols
    symbol: {
        '0': "push \\varnothing",
        '1': "push -1",
        '2': "push 1;push 2;operator frac 2",  // 1/2 (display)
        '3': "push 1;push 2;infix /",  // 1/2 (inline)
        '8': "push \\infty",
        'a': "push \\forall",
        'c': "push \\cdot",
        'C': "push \\bigcap",
        'd': "push \\partial",
        'e': "push \\exists",
	'E': "push \\nexists",
        'h': "push \\hslash",
        'i': "push \\int",
        'I': "push \\iint",
        'l': "push \\ell",
        'M': "push \\mp",
        'o': "push \\circ",
        'p': "push \\prod",
        'P': "push \\pm",
        's': "push \\sum",
        't': "push \\therefore",
        'U': "push \\bigcup",
        'v': "push \\vee",
	'V': "push \\bigvee",
        'w': "push \\wedge",
	'W': "push \\bigwedge",
        'y': "push \\oint",
        'Y': "push \\oiint",
        '.': "push \\dots",
        '>': "push \\cdots",
        '-': "push -",
        '+': "push +",
        '*': "push \\star",
        '|': "push |",
        '=': "push_separator",
        '?': "push ?",  // NOTE: no mode-sensitive help shortcut for symbols because of this
        '!': "push !",
        ',': "push ,",
        ';': "push semicolon",
        ':': "push :",
        '`': "push `",
        '_': "push \\_",
        "'": "push_placeholder",
        ' ': "push ",  // "nothing", e.g. when you don't want something on one side of an infix
        'ArrowUp': "push \\uparrow",
        'ArrowDown': "push \\downarrow"
    },

    // . prefix: expression decorators (fonts, hats, etc)
    decoration: {
        '0': "push 0;subscript",
        '1': "push -1;superscript",
        '2': "push 2;superscript",
        '3': "push 3;superscript",
        '4': "push 4;superscript",
        '8': "push \\infty;infix \\to",
        'A': "operator acute",
        'b': "font_operator mathbb",
        'c': "autoparenthesize;push 1;swap;infix -",
        'C': "html_class emphasized emphasized2",
        'd': "push \\dagger;superscript",
        'D': "push \\ddagger;superscript",
        'e': "operator bold",  // bold roman (sort of)
        'g': "operator mathring",
        'G': "operator grave",
        'h': "apply_hat hat",
        'H': "apply_hat widehat",
        'i': "push -;superscript",
        'I': "push +;superscript",
        'k': "font_operator mathfrak",
        'l': "push \\parallel;subscript",
        'm': "font_operator mathtt",
        'M': "prefix \\mp",
	'n': "prefix \\neg",
        'o': "operator bar",
        'O': "operator overline",
        'p': "push \\perp;subscript",
        'P': "prefix \\pm",
        'q': "prefix =",
        'r': "make_roman",
        's': "font_operator mathsf",  // sans-serif
        't': "prefix \\to",
        'T': "operator widetilde",
        'u': "apply_hat breve",
        'U': "operator utilde",
        'v': "operator vec",
        'V': "apply_hat check",
        'w': "operator overline",
        'W': "apply_hat widecheck",
        'x': "operator boxed",
        'X': "operator sout",  // strikeout
        'z': "operator cancel",
        '.': "apply_hat dot",
        '>': "push .;concat",
        "\"": "apply_hat ddot",
        ' ': "push \\,;concat",  // append thin space
        "'": "autoparenthesize;prime",
        '*': "push *;superscript",
        '~': "apply_hat tilde",
        '=': "prefix \\Rightarrow",
        '-': "prefix -",
        '+': "prefix +",
        '`': "push T;superscript",  // transpose
        '/': "push 1;swap;autoparenthesize;delimiters . . / 2",  // flex 1/x
        "\\": "push 1;swap;autoparenthesize;infix /",  // fixed 1/x
        '_': "operator underline",
        '?': "toggle_popup help decorations"
    },

    // | prefix: array/matrix operations
    array: {
        '[digit]': "prefix_argument",
        '*': "prefix_argument",
        'a': "build_align aligned",
        'c': "build_align cases",
        'C': "build_align rcases",
        'd': "dissolve_array",
        'e': "build_list ,\\,;push ,\\,\\dots;concat",
        'E': "push_matrix_ellipses",
        'f': "build_align cases_if",
        'F': "build_align rcases_if",
        'g': "build_align gathered",
        'h': "transpose_matrix;swap;transpose_matrix;swap;stack_arrays;transpose_matrix",  // i.e., stack horizontally
        'k': "build_substack",
        'm': "build_matrix_row matrix",
        'p': "build_list +;push +\\cdots;concat",
        's': "split_array",
        't': "mode change_matrix_type",
        'T': "transpose_matrix",
        'v': "build_matrix_row vmatrix",
        'V': "build_matrix_row Vmatrix",
        'x': "build_list product \\cdots",
        ' ': "build_list product",
        '|': "stack_arrays",
        ',': "build_list ,\\,",
        '.': "build_list ,\\, ,\\,\\dots,\\,",
        ';': "build_list semicolon\\,",
        '+': "build_infix_list + \\cdots",
        '(': "build_matrix_row pmatrix",
        '[': "build_matrix_row bmatrix",
        '{': "build_matrix_row Bmatrix",
        '@': "build_matrix_row bmatrix 2;transpose_matrix",
        '#': "build_matrix_row bmatrix 3;transpose_matrix",
        '$': "build_matrix_row bmatrix 2;unrot;build_matrix_row bmatrix 2;swap;stack_arrays",
        ':': "array_separator column dashed",
        '!': "array_separator column solid",
        '-': "array_separator row dashed",
        '_': "array_separator row solid",
        '?': "toggle_popup help arrays",
        'Enter': "stack_arrays"
    },

    change_matrix_type: {
        'm': "change_matrix_type matrix",
        'v': "change_matrix_type vmatrix",
        'V': "change_matrix_type Vmatrix",
        '(': "change_matrix_type pmatrix",
        '[': "change_matrix_type bmatrix",
        '{': "change_matrix_type Bmatrix"
    },

    dissect: {
	'default': "cancel_dissect_mode",
	'1': "dissect_descend left",
	'2': "dissect_descend right",
	'u': "dissect_ascend",
	'ArrowRight': "dissect_move_selection right",
	'ArrowLeft': "dissect_move_selection left",
	'x': "dissect_extract_selection",
	'Backspace': "dissect_delete_selection",

	'[': "dissect_change_delimiter_type [ ]",
	'(': "dissect_change_delimiter_type ( )",
	'p': "dissect_change_delimiter_type"  // remove existing brackets
    },

    // & prefix
    script: {
        '[alpha]': "self_push;to_case uppercase;font_operator mathscr",
        '&': "push \\&"
    },

    // % prefix
    calligraphic: {
        '[alpha]': "self_push;to_case uppercase;font_operator mathcal",
        '%': "push \\%"
    },

    // ; prefix: lowercase Greek letters
    lowercase_greek: {
        'a': "push \\alpha",     'b': "push \\beta",
        'c': "push \\chi",       'd': "push \\delta",
        'e': "push \\epsilon",   'f': "push \\phi",
        'g': "push \\gamma",     'h': "push \\eta",
        'i': "push \\iota",      'j': "push \\varphi",
        'k': "push \\kappa",     'l': "push \\lambda",
        'm': "push \\mu",        'n': "push \\nu",
        'o': "push \\omega",     'p': "push \\pi",
        'q': "push \\vartheta",  'r': "push \\rho",
        's': "push \\sigma",     't': "push \\tau",
        'u': "push \\upsilon",   'v': "push \\theta",
        'w': "push \\omega",     'x': "push \\xi",
        'y': "push \\psi",       'z': "push \\zeta",

        ':': "mode variant_greek",
        ';': "infix semicolon",
        '?': "toggle_popup help greek"
    },

    // : prefix: uppercase Greek letters
    uppercase_greek: {
        'd': "push \\Delta",     'e': "push \\varepsilon",
        'f': "push \\Phi",       'g': "push \\Gamma",
        'k': "push \\varkappa",  'l': "push \\Lambda",
        'm': "push \\varpi",     'o': "push \\Omega",
        'p': "push \\Pi",        'q': "push \\vartheta",
        'r': "push \\varrho",    's': "push \\Sigma",
        't': "push \\varsigma",  'u': "push \\Upsilon",
        'v': "push \\Theta",     'w': "push \\Omega",
        'x': "push \\Xi",        'y': "push \\Psi",
        '6': "push \\digamma",   '^': "push \\digamma",
        'n': "push \\nabla",  // special case

        // TODO: support for case-insensitive keybindings in general
        'D': "push \\Delta",     'E': "push \\varepsilon",
        'F': "push \\Phi",       'G': "push \\Gamma",
        'K': "push \\varkappa",  'L': "push \\Lambda",
        'M': "push \\varpi",     'O': "push \\Omega",
        'P': "push \\Pi",        'Q': "push \\vartheta",
        'R': "push \\varrho",    'S': "push \\Sigma",
        'T': "push \\varsigma",  'U': "push \\Upsilon",
        'V': "push \\Theta",     'W': "push \\Omega",
        'X': "push \\Xi",        'Y': "push \\Psi",
        'N': "push \\nabla",

        ':': "infix :",
        '?': "toggle_popup help greek"
    },

    // "variant" uppercase Greek letters - these are italic versions of the normal ones
    variant_greek: {
        'd': "push \\varDelta",    'D': "push \\varDelta",
        'f': "push \\varPhi",      'F': "push \\varPhi",
        'g': "push \\varGamma",    'G': "push \\varGamma",
        'l': "push \\varLambda",   'L': "push \\varLambda",
        'o': "push \\varOmega",    'O': "push \\varOmega",
        'p': "push \\varPi",       'P': "push \\varPi",
        'q': "push \\varTheta",    'Q': "push \\varTheta",
        's': "push \\varSigma",    'S': "push \\varSigma",
        'u': "push \\varUpsilon",  'U': "push \\varUpsilon",
        'x': "push \\varXi",       'X': "push \\varXi",
        'y': "push \\varPsi",      'Y': "push \\varPsi",

        '?': "toggle_popup help greek"
    }
};


export default EditorKeymap;
