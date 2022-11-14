
const EditorKeymap = {
    base: {
        // Self-insert keys
        '[alnum]': "self_insert",
        '#': "insert \\#",
        '@': "insert @",
        '*': "insert *",
        '~': "insert \\sim",

        // Immediate action special keys
        '!': "autoparenthesize;insert !;concat",
        'Enter': "subscript",
        '_': "subscript",
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
        'Ctrl+0': "insert 0;subscript",
        'Ctrl+1': "insert -1;superscript",
        'Ctrl+2': "insert 2;superscript",
        'Ctrl+3': "insert 3;superscript",
        'Ctrl+4': "insert 4;superscript",
        'Ctrl+a': "swap",
        'Ctrl+b': "make_bold",
        'Ctrl+c': "copy_to_clipboard",
        'Ctrl+e': "insert e;operator mathrm;swap;superscript",  // exp(x) - same as [/][e]
        'Ctrl+i': "pop_to_document",
        'Ctrl+j': "extract_from_document",
        'Ctrl+k': "infix \\,",
        'Ctrl+l': "recenter_document 50",
        'Ctrl+m': "prefix -",
        'Ctrl+o': "parenthesize;swap;operator mathopen;swap;concat",  // -> f(x): same as [/][o]
        'Ctrl+p': "delimiters ( )",
        'Ctrl+r': "infix ,;parenthesize;swap;operator mathopen;swap;concat",  // -> f(x,y): same as [/][r]
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
        'ArrowDown': "select_adjacent_file 1"
    },

    // User Manual mode
    help: {
        'ArrowDown': 'scroll popup_panel vertical 25',
        'ArrowUp': 'scroll popup_panel vertical -25',
        'j': 'scroll popup_panel vertical 25',
        'k': 'scroll popup_panel vertical -25',
        'ArrowLeft': 'do_cancel',
        'ArrowRight': 'do_cancel',
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
        'Enter': "dup",
        'Backspace': "pop",
        'Tab': "undo",
        '.': "redo",
        '!': "export_document_as_text",
        '@': "export_stack_items_as_text",
        '$': "toggle_show_latex_source",
        'ArrowRight': "scroll document_container horizontal 75",
        'ArrowLeft': "scroll document_container horizontal -75",
        '?': "toggle_popup help stack"
    },

    // $ prefix: configuration
    config: {
        'i': "config toggle_inline_math",
        'm': "mode config_math_alignment",
        'r': "config reset_layout",
        's': "mode config_stack",
        't': "mode config_theme",
        'z': "mode config_zoom",
        '$': "insert \\$",
        '?': "toggle_popup help configuration"
    },
    // $m
    config_math_alignment: {
        'd': "config math_align toggle_document",
        's': "config math_align toggle_stack",
        '?': "toggle_popup help configuration"
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
        'ArrowDown': "config stack_side bottom",
        '?': "toggle_popup help configuration"
    },
    // $t
    config_theme: {
        '0': "config theme default",
        '1': "config theme dawn",
        '2': "config theme dusk",
        '3': "config theme dark",
        '?': "toggle_popup help configuration"
    },
    // $z
    config_zoom: {
        '0': "config zoom_factor 0",
        '+': "config zoom_factor +",
        '-': "config zoom_factor -",
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
        'b': "delimiters \\langle \\vert",  //  <x| Dirac bra
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
        '[': "delimiters [ ]",
        ']': "insert \\llbracket;swap;concat;insert \\rrbracket;concat",
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
        '1': "insert 1;swap;operator frac 2",
        '2': "mode squared",
        'a': "apply_operator 1",
        'A': "apply_operator 2",
        'b': "operator binom 2",
        'c': "named_function cos",
        'C': "named_function csc",
        'd': "mode derivative",
        'D': "named_function det",
        'e': "insert e;operator mathrm;swap;superscript",  // exp(x)
        'E': "named_function exp",
        'f': "autoparenthesize;swap;autoparenthesize;swap;delimiters . . / 2",  // NOTE: duplicates [,/]
        'g': "insert \\argmin;swap;subscript",
        'G': "insert \\argmax;swap;subscript",
        'h': "mode hyperbolic",
        'i': "mode integral_limits",
        'k': "delimiters . . \\vert 2;parenthesize;swap;operator mathopen;swap;concat",  // f x y -> f(x|y)
        'l': "insert \\limits;swap;subscript;insert \\lim;swap;concat",  // lim_{x}
        'm': "named_function min",
        'M': "named_function max",
        'n': "named_function ln",
        'N': "named_function log",
        'o': "parenthesize;swap;operator mathopen;swap;concat",   // f x -> f(x)  "of"; \mathopen closes up the spacing after 'f'
        'p': "parenthesize;operator Pr",  // Pr(x) (probability)
        'P': "insert \\,;swap;concat;swap;insert \\,;concat;swap;delimiters . . \\vert 2;parenthesize;operator Pr",  // Pr(y|x)
        'q': "operator sqrt",
        'Q': "operator sqrt[3]",
        'r': "infix ,;parenthesize;swap;operator mathopen;swap;concat",  // f x y -> f(x,y)
        's': "named_function sin",
        'S': "named_function sec",
        't': "named_function tan",
        'T': "named_function cot",
        'u': "insert \\limits;swap;subscript;insert \\inf;swap;concat",
        'U': "insert \\limits;swap;subscript;insert \\sup;swap;concat",
        'v': "parenthesize;insert Var;operator operatorname;swap;concat",
        'V': "swap;insert ,;concat;swap;concat;parenthesize;insert Cov;operator operatorname;swap;concat",
        'x': "insert E;operator mathbb;operator mathopen;swap;delimiters [ ];concat",  // E[x] (expectation)
        'X': "insert E;operator mathbb;swap;subscript;operator mathopen;swap;delimiters [ ];concat",  // E_x[y] (with subscript)
        ';': "apply_tag",
        ',': "split_infix",
        '/': "operator frac 2",
        '[': "delimiters [ ];swap;operator mathopen;swap;concat",  // f x -> f[x]
        ']': "delimiters \\{ \\};swap;operator mathopen;swap;concat",  // f x -> f{x}
        '}': "swap;operator underbrace;swap;subscript",
        '{': "swap;operator overbrace;swap;superscript",
        '<': "extract_infix_side left",
        '>': "extract_infix_side right",
        '-': "mode inverse",
        '=': "unrot;infix =;insert \\sum;swap;subscript;swap;superscript",
        '+': "infix \\ge;insert \\sum;swap;subscript",
        "'": "substitute_defer",
        "\"": "toggle_is_heading",
        'Enter': "unrot;subscript;swap;superscript",  // apply superscript and subscript at once
        '?': "toggle_popup help operators"
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
        'n': "named_function lg",  // [n][N] are special cases for base-2 log
        'N': "named_function log _2",
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
        'r': "insert -\\infty;subscript;insert \\infty;superscript",  // -oo..oo : [r]eals
        'n': "insert -\\infty;subscript;insert 0;superscript",  // -oo..0 : [n]egative 
        'p': "insert 0;subscript;insert \\infty;superscript",  // 0..oo : [p]ositive
        'u': "insert 0;subscript;insert 1;superscript",  // 0..1 : [u]nit
        'U': "insert -1;subscript;insert 1;superscript",  // -1..1 : symmetric [U]nit
        't': "insert 0;subscript;insert 2\\pi;superscript",  // 0..2pi : [t]rigonometric
        'T': "insert -\\pi;subscript;insert \\pi;superscript",  // -pi..pi : symmetric [T]rigonometric
        '?': "toggle_popup help integrals"
    },

    // /d prefix: derivative operations
    derivative: {
        // \partial y / \partial x
        'j': "insert \\partial;swap;concat;swap;insert \\partial;swap;concat;swap;operator frac 2",
        // \partial^2 y / \partial x^2
        'J': "insert 2;superscript;insert \\partial;swap;concat;swap;insert \\partial;insert 2;superscript;swap;concat;swap;operator frac 2",
        // dy/dx
        'k': "insert d;operator mathrm;swap;concat;swap;insert d;operator mathrm;swap;concat;swap;operator frac 2",
        // d^2(y) / dx^2
        'K': "insert 2;superscript;insert d;operator mathrm;swap;concat;swap;insert d;operator mathrm;insert 2;superscript;swap;concat;swap;operator frac 2",
        // \partial / \partial x
        'q': "insert \\partial;swap;concat;insert \\partial;swap;operator frac 2",
        // \partial^2 / \partial x^2
        'Q': "insert 2;superscript;insert \\partial;swap;concat;insert \\partial;insert 2;superscript;swap;operator frac 2",
        // d/dx
        'x': "insert d;operator mathrm;swap;concat;insert d;operator mathrm;swap;operator frac 2",
        // d^2 / dx^2
        'X': "insert 2;superscript;insert d;operator mathrm;swap;concat;insert d;operator mathrm;insert 2;superscript;swap;operator frac 2",
        // \partial^2 / \partial x\,\partial y
        'm': "insert \\partial;swap;concat;insert \\partial;rot;concat;swap;insert \\,;swap;concat;concat;insert \\partial;insert 2;superscript;swap;operator frac 2",
        // \partial^2 z / \partial x\,\partial y
        'M': "insert \\partial;swap;concat;insert \\partial;rot;concat;swap;insert \\,;swap;concat;concat;swap;insert \\partial;insert 2;superscript;swap;concat;swap;operator frac 2",
        // gradient
        'g': "insert \\nabla;swap;concat",
        // gradient with respect to x
        'G': "insert \\nabla;swap;subscript;swap;concat",
        // divergence
        '.': "insert \\nabla;insert \\cdot;concat;swap;concat",
        // curl
        'c': "insert \\nabla;insert \\times;concat;swap;concat",
        // Laplacian
        'l': "insert \\nabla;insert 2;superscript;swap;concat",
        // d'Alembertian
        'L': "insert \\Box;insert 2;superscript;swap;concat",
        // x -> dx
        'd': "insert d;operator mathrm;swap;concat",
        // x -> d^2x
        '2': "insert d;operator mathrm;insert 2;superscript;swap;concat",
        '3': "insert d;operator mathrm;insert 3;superscript;swap;concat",
        '4': "insert d;operator mathrm;insert 4;superscript;swap;concat",
        // y x -> y dx
        'i': "swap;insert \\,;concat;swap;insert d;operator mathrm;swap;concat;concat",
        // y x -> ydx (with thinspace after the dx)
        'I': "insert d;operator mathrm;swap;concat;concat;insert \\,;concat",
        // y x -> ydx (no spacing around the dx)
        ' ': "insert d;operator mathrm;swap;concat;concat",

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
        'k': "insert \\,;swap;concat;swap;insert \\,;concat;swap;delimiters . . \\vert 2",  // x | y  ([k]onditional)
        'l': "infix \\parallel",
        'm': "infix \\mapsto",
        'M': "infix \\mp",
        'n': "conjunction when",
        'o': "infix \\circ",
        'O': "stackrel overset",
        'p': "infix \\perp",
        'P': "infix \\pm",
        'q': "conjunction and",
        'Q': "conjunction or",
        'r': "conjunction for",
        's': "infix \\,",
        't': "infix \\to",
        'T': "infix \\longrightarrow",
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
        '`': "swap;insert T;superscript;swap;concat",  // xTy
        '%': "infix \\pmod",  // y (mod x)
        '*': "infix *",
        "\\": "autoparenthesize;swap;autoparenthesize;swap;delimiters . . / 2",
        '/': "autoparenthesize;swap;autoparenthesize;swap;infix /",
        '>': "infix \\cdots",
        '?': "toggle_popup help infix"
    },

    // = prefix: relational operators
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
        't': "infix \\sim",
        '=': "infix =",
        '<': "infix \\le",
        '>': "infix \\ge",
        '[': "infix \\le",
        ']': "infix \\ge",
        ':': "infix \\coloneqq",
        '~': "infix \\sim",
        '|': "infix \\vDash",
        '?': "toggle_popup help relational"
    },

    // apostrophe prefix: assorted standalone math symbols
    symbol: {
        '0': "insert \\varnothing",
        '1': "insert -1",
        '2': "insert 1;insert 2;operator frac 2",  // 1/2 (display)
        '3': "insert 1;insert 2;infix /",  // 1/2 (inline)
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
        '=': "insert_separator hrule",
        '?': "insert ?",  // NOTE: no mode-sensitive help shortcut for symbols because of this
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
        '0': "insert 0;subscript",
        '1': "insert -1;superscript",
        '2': "insert 2;superscript",
        '3': "insert 3;superscript",
        '4': "insert 4;superscript",
        '8': "insert \\infty;infix \\to",
        'a': "operator overrightarrow",  // TODO: [R] maybe instead
        'b': "operator mathbb",
        'c': "autoparenthesize;insert 1;swap;infix -",
        'C': "mode color",
        'd': "insert \\dagger;superscript",
        'D': "insert \\ddagger;superscript",
        'e': "operator bold",  // bold roman (sort of)
        'f': "prefix \\therefore",
        'F': "prefix \\because",
        'g': "operator mathring",
        'G': "operator grave",
        'h': "apply_hat hat",
        'H': "apply_hat widehat",
        'i': "insert -;superscript",
        'I': "insert +;superscript",
        'k': "operator mathfrak",
        'l': "insert \\parallel;subscript",
        'm': "operator mathtt",
        'M': "prefix \\mp",
        'o': "operator bar",
        'O': "operator overline",
        'p': "insert \\perp;subscript",
        'P': "prefix \\pm",
        'r': "make_roman",
        's': "operator mathsf",  // sans-serif
        't': "prefix \\to",
        'T': "operator widetilde",
        'u': "apply_hat breve",
        'U': "operator utilde",
        'v': "operator vec",
        'V': "apply_hat check",
        'w': "apply_hat widehat",
        'W': "apply_hat widecheck",
        'x': "operator boxed",
        'X': "operator sout",  // strikeout
        '.': "apply_hat dot",
        "\"": "apply_hat ddot",
        ' ': "insert \\,;concat",  // append thin space
        "'": "autoparenthesize;prime",
        '*': "insert *;superscript",
        '~': "apply_hat tilde",
        '=': "prefix \\Rightarrow",
        '-': "prefix -",
        '+': "prefix +",
        '`': "insert T;superscript",  // transpose
        '/': "operator cancel",
        "\\": "insert 1;swap;autoparenthesize;delimiters . . / 2",  // variable-size 1/x
        '_': "operator underline",
        '?': "toggle_popup help decorations"
    },

    // .C prefix: set colors
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
        '[digit]': "prefix_argument",
        '*': "prefix_argument",
        'a': "build_align aligned",
        'c': "build_align cases",
        'C': "build_align rcases",
        'd': "dissolve_matrix",
        'e': "build_list ,\\,;insert ,\\,\\dots;concat",
        'E': "insert_matrix_ellipses",
        'f': "build_align cases_if",
        'F': "build_align rcases_if",
        'g': "build_align gathered",
        'h': "matrix_transpose;swap;matrix_transpose;swap;stack_matrices;matrix_transpose",  // i.e., stack horizontally
        'k': "build_substack",
        'm': "build_matrix_row matrix",
        'p': "build_list +;insert +\\cdots;concat",
        's': "split_matrix",
        'T': "matrix_transpose",
        'v': "build_matrix_row vmatrix",
        'V': "build_matrix_row Vmatrix",
        '|': "stack_matrices",
        ',': "build_list ,",
        ' ': "build_list ,\\,",
        '.': "build_list ,\\, ,\\,\\dots,\\,",
        ';': "build_list semicolon\\,",
        '+': "build_infix_list + \\cdots",
        '(': "build_matrix_row pmatrix",
        '[': "build_matrix_row bmatrix",
        '{': "build_matrix_row Bmatrix",
        '@': "build_matrix_row bmatrix 2;matrix_transpose",
        '#': "build_matrix_row bmatrix 3;matrix_transpose",
        '$': "build_matrix_row bmatrix 2;unrot;build_matrix_row bmatrix 2;swap;stack_matrices",
        ':': "array_separator column dashed",
        '!': "array_separator column solid",
        '-': "array_separator row dashed",
        '_': "array_separator row solid",
        'Enter': "stack_matrices",
        '?': "toggle_popup help arrays"
    },

    // & prefix
    script: {
        '[alpha]': "self_insert;to_case uppercase;operator mathscr",
        '&': "insert \\&"
    },

    // % prefix
    calligraphic: {
        '[alpha]': "self_insert;to_case uppercase;operator mathcal",
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

        ':': "mode variant_greek",
        ';': "infix semicolon",
        '?': "toggle_popup help greek"
    },

    // : prefix: uppercase Greek letters
    uppercase_greek: {
        'd': "insert \\Delta",     'e': "insert \\varepsilon",
        'f': "insert \\Phi",       'g': "insert \\Gamma",
        'k': "insert \\varkappa",  'l': "insert \\Lambda",
        'm': "insert \\varpi",     'o': "insert \\Omega",
        'p': "insert \\Pi",        'q': "insert \\vartheta",
        'r': "insert \\varrho",    's': "insert \\Sigma",
        't': "insert \\varsigma",  'u': "insert \\Upsilon",
        'v': "insert \\Theta",     'w': "insert \\Omega",
        'x': "insert \\Xi",        'y': "insert \\Psi",
        '6': "insert \\digamma",   '^': "insert \\digamma",
        'n': "insert \\nabla",  // special case

        // TODO: support for case-insensitive keybindings in general
        'D': "insert \\Delta",     'E': "insert \\varepsilon",
        'F': "insert \\Phi",       'G': "insert \\Gamma",
        'K': "insert \\varkappa",  'L': "insert \\Lambda",
        'M': "insert \\varpi",     'O': "insert \\Omega",
        'P': "insert \\Pi",        'Q': "insert \\vartheta",
        'R': "insert \\varrho",    'S': "insert \\Sigma",
        'T': "insert \\varsigma",  'U': "insert \\Upsilon",
        'V': "insert \\Theta",     'W': "insert \\Omega",
        'X': "insert \\Xi",        'Y': "insert \\Psi",
        'N': "insert \\nabla",

        ':': "infix :",
        '?': "toggle_popup help greek"
    },

    // "variant" uppercase Greek letters - these are italic versions of the normal ones
    variant_greek: {
        'd': "insert \\varDelta",    'D': "insert \\varDelta",
        'f': "insert \\varPhi",      'F': "insert \\varPhi",
        'g': "insert \\varGamma",    'G': "insert \\varGamma",
        'l': "insert \\varLambda",   'L': "insert \\varLambda",
        'o': "insert \\varOmega",    'O': "insert \\varOmega",
        'p': "insert \\varPi",       'P': "insert \\varPi",
        'q': "insert \\varTheta",    'Q': "insert \\varTheta",
        's': "insert \\varSigma",    'S': "insert \\varSigma",
        'u': "insert \\varUpsilon",  'U': "insert \\varUpsilon",
        'x': "insert \\varXi",       'X': "insert \\varXi",
        'y': "insert \\varPsi",      'Y': "insert \\varPsi",

        '?': "toggle_popup help greek"
    }
};


export default EditorKeymap;
