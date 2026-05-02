

// Parsers for "algebraic" math entry mode and for text item entry.


import {
  Expr, TextExpr, CommandExpr, SequenceExpr, DelimiterExpr,
  SubscriptSuperscriptExpr, InfixExpr, PrefixExpr, PostfixExpr,
  FontExpr, PlaceholderExpr, FunctionCallExpr, ArrayExpr,
  TensorExpr, SymPyExpr,
  latex_unary_named_operators
} from './Exprs';
import {
  TextItem, TextItemElement, TextItemTextElement,
  TextItemExprElement, TextItemRawElement
} from './Models';
import {
  latex_letter_commands
} from './SymPy';


class Token {
  // Combine adjacent tokens of the same type, creating
  // individual longer tokens.
  static coalesce_tokens_of_type(tokens, token_type) {
    const new_tokens = [];
    let i = 0;
    while(i < tokens.length) {
      if(tokens[i].type === token_type) {
        const start_position = tokens[i].source_position;
        const merged_texts = [];
        while(i < tokens.length && tokens[i].type === token_type)
          merged_texts.push(tokens[i++].text);
        new_tokens.push(new this(
          token_type,
          merged_texts.join(''),
          start_position));
      }
      else new_tokens.push(tokens[i++]);
    }
    return new_tokens;
  }
  
  constructor(type, text, source_position) {
    this.type = type;
    this.text = text;
    this.source_position = source_position;
  }

  // toString() {
  //   return [
  //     '[', this.type, '@', this.source_position.toString(),
  //     ':', this.text, ']'
  //   ].join('');
  // }
}


class TokenizerError extends Error {
  constructor(message, position) {
    super(message);
    this.position = position;
  }
}


class Tokenizer {
  static tokenize_expr(input_string) {
    const tokenizer = new this(expr_tokenizer_pattern_table);
    return tokenizer.tokenize(input_string);
  }

  static tokenize_text_item(input_string) {
    const tokenizer = new this(text_item_tokenizer_pattern_table);
    return tokenizer.tokenize(input_string);
  }
  
  constructor(pattern_table) {
    this.pattern_table = pattern_table;
    this.scan_position = null;
  }

  error(message) {
    throw new TokenizerError(message, this.scan_position);
  }

  // Returns structure with success/error info.
  tokenize(input_string) {
    try {
      const tokens = this._tokenize(input_string);
      return {success: true, tokens: tokens};
    }
    catch(e) {
      if(e instanceof TokenizerError) {
        return {
          success: false,
          error_message: e.message,
          error_position: e.position
        };
      }
      else throw e;
    }
  }

  // Returns list of Tokens.
  _tokenize(input_string) {
    const tokens = [];
    this.scan_position = 0;
    while(this.scan_position < input_string.length) {
      let any_matched = false;
      for(const pattern of this.pattern_table) {
        const token = this.try_pattern(pattern, input_string);
        if(token) {
          tokens.push(token);
          any_matched = true;
          break;
        }
        else
          ;  // try next pattern in the table
      }
      if(!any_matched) {
        this.error("Syntax error");
        break;
      }
    }
    return tokens;
  }

  try_pattern(pattern, input_string) {
    const [regex, token_type] = pattern;
    regex.lastIndex = this.scan_position;
    const match = regex.exec(input_string);
    if(match) {
      const text = match[0];
      this.scan_position += text.length;
      return new Token(token_type, text, this.scan_position);
    }
    else
      return null;
  }
}


class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.token_index = 0;
  }

  at_end() {
    return this.token_index >= this.tokens.length;
  }

  peek_for(...token_types) {
    if(this.at_end())
      return null;
    else if(token_types.includes(this.tokens[this.token_index].type))
      return this.tokens[this.token_index];
    else
      return null;
  }

  consume(...token_types) {
    const token = this.peek_for(...token_types);
    if(token)
      this.next_token();
    return token;
  }
  
  next_token() {
    if(this.at_end()) {
      this.current_token = null;
      this.parse_error();
    }
    else
      this.current_token = this.tokens[this.token_index++];
    return this.current_token;
  }

  // TODO: revisit; rename -> .error()
  parse_error() { throw new Error('parse_error'); }
}


// Patterns are in order of precedence.
// All regexes must have the 'sticky' flag: /abc/y
const expr_tokenizer_pattern_table = [
  [/\d*\.?\d+/y, 'number'],  // (potential) int or float (nonnegative)
  [/\[\]/y,      'placeholder'],  // "[]"
  [/\/\//y,      'fraction_bar'],  // "//"
  [/<=|>=/y,     'relation'],  // check 2-char operators first
  [/=|!=|<|>/y,  'relation'],  // 1-char operators
  [/[A-Za-z]+/y, 'ident'],
  [/\s+/y,       'whitespace'],
  [/-/y,         'minus'],
  [/\+/y,        'plus'],
  [/,/y,         'comma'],
  [/_/y,         'subscript'],
  [/\!/y,        'factorial'],
  [/'/y,         'prime'],
  [/\*/y,        'multiply'],
  [/\//y,        'divide'],
  [/\^/y,        'power'],
  [/\(/y,        'left_paren'],
  [/\)/y,        'right_paren'],
  [/\[/y,        'left_bracket'],
  [/\]/y,        'right_bracket'],
  [/\{/y,        'left_brace'],
  [/\}/y,        'right_brace']
];

class ExprParser extends Parser {
  static parse_string(s) {
    const result = Tokenizer.tokenize_expr(s);
    if(result.success) {
      const parser = new this(result.tokens);
      const expr = parser.parse_expr();
      if(!expr) return null;
      // Should not have any extraneous tokens at the end.
      if(!parser.at_end()) return null;
      return expr;
    }
    else
      return null;  // TODO: report error
  }

  constructor(tokens) {
    super(tokens);
    this.tokens = this.tokens.filter(
      token => token.type !== 'whitespace');
  }

  parse_expr() {
    const initial_minus = this.consume('minus');
    let term = this.parse_term() || this.parse_error();
    let terms = [term], operator_tokens = [];
    let binary_token;
    do {
      binary_token = this.consume(
        'plus', 'minus', 'multiply', 'divide',
        'comma', 'relation', 'fraction_bar');
      if(binary_token) {
        term = this.parse_term() || this.parse_error();
        operator_tokens.push(binary_token);
        terms.push(term);
      }
    } while(binary_token);
    [terms, operator_tokens] =
      this._combine_fractions_in_expr(terms, operator_tokens);
    if(initial_minus)
      terms[0] = PrefixExpr.unary_minus(terms[0]);
    return this._combine_expr_terms(terms, operator_tokens);
  }

  // '//' fraction bars at the "highest precedence" and all other
  // binary operators are at the same, lower precedence.
  _combine_fractions_in_expr(terms, operator_tokens) {
    const new_terms = [terms[0]];
    const new_operator_tokens = [];
    for(const [i, operator_token] of operator_tokens.entries()) {
      if(operator_token.type === 'fraction_bar') {
        const numer_term = new_terms.pop();
        const frac_term = new CommandExpr('frac', [
          this._remove_outer_parenthesis(numer_term),
          this._remove_outer_parenthesis(terms[i+1])]);
        new_terms.push(frac_term);
      }
      else {
        new_operator_tokens.push(operator_tokens[i]);
        new_terms.push(terms[i+1]);
      }
    }
    return [new_terms, new_operator_tokens];
  }

  _combine_expr_terms(terms, operator_tokens) {
    const operator_exprs = operator_tokens.map(
      token => this._infix_op_for_token(token));
    const split_at_index = operator_tokens.findLastIndex(
      token => token.type === 'relation') ?? 0;
    if(operator_exprs.length === 0)
      return terms[0];
    else
      return new InfixExpr(
        terms, operator_exprs, split_at_index);
  }

  _infix_op_for_token(token) {
    if(token.type === 'relation') {
      switch(token.text) {
      case '<=': return new CommandExpr('le');
      case '>=': return new CommandExpr('ge');
      case '!=': return new CommandExpr('ne');
      default: return new TextExpr(token.text);  // = > <
      }
    }
    else if(token.type === 'multiply')
      return new CommandExpr('cdot');
    else
      return new TextExpr(token.text);
  }

  // One or more factors, combined by implicit multiplication
  // or by concatenating into function calls like 'f (x)' -> f(x),
  // or builtins like 'sin x' -> '\sin{x}'.
  parse_term() {
    let factor = this.parse_factor(true) || this.parse_error();
    let factors = [factor];
    do {
      factor = this.parse_factor(false);
      if(factor) factors.push(factor);
    } while(factor);
    // Merge combinable factors until the list stops shrinking.
    // It needs to be like this to handle cases like:
    //   f, (x), g, (x)  =>  f(x), g(x)  => f(x)g(x)
    //   sin, cos, x  =>  sin, \cos{x}  =>  \sin{\cos{x}}
    let old_factors;
    do {
      [old_factors, factors] =
        [factors, this._combine_factors(factors)];
    } while(factors.length !== old_factors.length);
    // Combine remaining factors (>1) into a sequence.
    if(factors.length === 1)
      return factors[0];
    else
      return new SequenceExpr(factors);
  }

  _combine_factors(factors) {
    // Combine in right-to-left order to handle cases
    // like 'sin cos x'.  This makes it right-associative.
    const new_factors = [];
    let i = factors.length-1;
    while(i >= 0) {
      if(i >= 1) {
        const combined = this._combine_factor_pair(
          factors[i-1], factors[i]);
        if(combined) {
          new_factors.push(combined);
          i -= 2;
          continue;
        }
      }
      new_factors.push(factors[i--]);
    }
    new_factors.reverse();
    return new_factors;
  }

  _combine_factor_pair(lhs, rhs) {
    if(lhs.is_font_expr() && lhs.typeface === 'roman' &&
       lhs.expr.is_text_expr()) {
      if(latex_unary_named_operators.has(lhs.expr.text))
        return new CommandExpr(lhs.expr.text, [rhs]);  // sin x, etc.
      else if(lhs.expr.text === 'sqrt')
        return new CommandExpr(lhs.expr.text, [
          this._remove_outer_parenthesis(rhs)]);  // sqrt(x+1)
      else
        return null;
    }
    else if(rhs.is_delimiter_expr() && !lhs.is_delimiter_expr())
      return new FunctionCallExpr(lhs, rhs);  // f(x)
    else
      return null;
  }

  // Meant for removing the outer ()-parens (only) from numerator/denominator
  // of a full-size fraction (and from superscript powers).
  // We want (x+1)//(x+2) => \frac{x+1}{x+2}
  _remove_outer_parenthesis(expr) {
    if(expr.is_delimiter_expr() && expr.has_types('(', ')'))
      return expr.inner_expr;
    else
      return expr;
  }

  parse_factor(initial_factor, allow_subscript_superscript = true) {
    let factor = this._parse_factor(initial_factor);
    while(factor) {
      if(allow_subscript_superscript && this.consume('subscript')) {
        const subscript = this.parse_factor(true, false) || this.parse_error();
        factor = factor.with_subscript(subscript);
      }
      else if(allow_subscript_superscript && this.consume('power')) {
        const exponent = this.parse_factor(true, false) || this.parse_error();
        if(factor.is_text_expr_with('e'))
          factor = FontExpr.roman(factor);  // e^x
        factor = factor.with_superscript(
          this._remove_outer_parenthesis(exponent));
      }
      else if(this.consume('factorial'))
        factor = Expr.concatenate(factor, new TextExpr('!'));
      else if(this.consume('prime'))
        factor = factor.with_prime(true);
      else break;
    }
    return factor;
  }

  // 'initial_factor': Constant numbers are only allowed as the first
  // factor in an implicit product list: we can have '3x' but not 'x3'.
  _parse_factor(initial_factor) {
    if(initial_factor && this.consume('number'))
      return TextExpr.integer(this.current_token.text);
    else if(this.consume('ident')) {
      const ident_text = this.current_token.text;
      if(latex_letter_commands.has(ident_text))
        return new CommandExpr(ident_text);  // Greek letters, etc.
      else if(ident_text.length === 1)
        return new TextExpr(ident_text);  // single-letter variable
      else  // multi-letter variable
        return FontExpr.roman_text(ident_text);
    }
    else if(this.consume('placeholder'))
      return new PlaceholderExpr();
    else if(this.consume('left_paren', 'left_bracket', 'left_brace')) {
      const [closing_delim_type, left, right] =
            this.matching_closing_delimiter_info(this.current_token.type);
      const inner_expr = this.parse_expr() || this.parse_error();
      const closing_token = this.consume('right_paren', 'right_bracket', 'right_brace');
      if(!(closing_token && closing_token.type === closing_delim_type))
        return this.parse_error();
      else
        return new DelimiterExpr(left, right, inner_expr);
    }
    else
      return null;
  }

  matching_closing_delimiter_info(open_delim) {
    switch(open_delim) {
    case 'left_bracket': return ['right_bracket', '[', ']'];
    case 'left_brace': return ['right_brace', "\\{", "\\}"];
    case 'left_paren':
    default: return ['right_paren', '(', ')'];
    }
  }
}


const text_item_tokenizer_pattern_table = [
  [/\*\*/y,           'bold_toggle'],
  [/\/\//y,           'italic_toggle'],
  [/\[\]/y,           'placeholder'],
  [/\$[^\$]+\$/y,     'inline_math'],
  [/[^\*\/\[\]\$]+/y, 'text'],  // "normal" text spans
  [/[\*\/\[\]\$]/y,   'text']   // stray control codes like isolated ']'
];

// Parser for text entry mode.  The following "escape sequences" are available:
//  - **bold text** - Converts into a bolded TextItemTextElement
//  - //italic text// - Converts into an italic TextItemTextElement
//  - [] - Converts into a TextItemExprElement wrapping a PlaceholderExpr
//  - $x+y$ - Converts into TextItemExprElement with an inline math expression
//            as parsed by ExprParser.  If the parsing fails (invalid syntax),
//            the whole text item parsing fails.
class TextItemParser extends Parser {
  static parse_string(s) {
    const result = Tokenizer.tokenize_text_item(s);
    if(result.success) {
      // Combine adjacent 'text' tokens together; this is needed
      // because of how the regexes are set up.
      // e.g. 'test ] abc' => ['test ', ']', ' abc'] tokens.
      const tokens = Token
            .coalesce_tokens_of_type(result.tokens, 'text');
      const parser = new this(tokens, s);
      return parser.parse();
    }
    else
      return null;  // TODO: report error
  }

  constructor(tokens, source_string) {
    super(tokens);
    this.source_string = source_string;
    this.is_bold = false;
    this.is_italic = false;
    this.elements = [];
  }

  parse() {
    while(!this.at_end()) {
      if(this.consume('bold_toggle'))
        this.is_bold = !this.is_bold;
      else if(this.consume('italic_toggle'))
        this.is_italic = !this.is_italic;
      else if(this.consume('inline_math'))
        this.add_inline_math(token.text);
      else if(this.consume('placeholder'))
        this.add_placeholder();
      else if(this.consume('text'))
        this.add_text(this.current_token.text);
      else
        break;  // shouldn't happen
    }
    return this.build_text_item();
  }

  add_inline_math(math_text) {
    // Token text will always be surrounded by '$...$'; strip it out.
    math_text = math_text.slice(1, -1).trim();
    if(math_text.length === 0)
      return;
    let math_expr = ExprParser.parse_string(math_text);
    if(!math_expr)  // entire TextItem parsing fails if inline math fails
      return this.parse_error();
    if(this.is_bold)
      math_expr = math_expr.as_bold();  // NOTE: italic flag ignored
    this.elements.push(new TextItemExprElement(math_expr));
  }

  add_placeholder() {
    let placeholder_expr = new PlaceholderExpr();
    if(this.is_bold)
      placeholder_expr = placeholder_expr.as_bold();
    this.elements.push(new TextItemExprElement(placeholder_expr));
  }

  add_text(text) {
    return this.elements.push(
      new TextItemTextElement(
        text, this.is_bold, this.is_italic));
  }

  build_text_item() {
    if(this.elements.length > 0)
      return new TextItem(
        this.elements,
        null /* tag */,
        this.source_string /* source */);
    else return null;  // could happen for '$', '$$$', etc.
  }
}


export {
  ExprParser, TextItemParser
};

