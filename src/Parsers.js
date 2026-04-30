

import {
  Expr, TextExpr, CommandExpr, SequenceExpr, DelimiterExpr,
  SubscriptSuperscriptExpr, InfixExpr, PrefixExpr, PostfixExpr,
  FontExpr, PlaceholderExpr, FunctionCallExpr, ArrayExpr,
  TensorExpr, SymPyExpr
} from './Exprs';
import {
  latex_letter_commands
} from './SymPy';


class Token {
  constructor(type, text, source_position) {
    this.type = type;
    this.text = text;
    this.source_position = source_position;
  }
}


// Patterns are in order of precedence.
// All regexes must have the 'sticky' flag: /abc/y
const expr_tokenizer_pattern_table = [
  [/\d*\.?\d+/y, 'number'],  // (potential) int or float (nonnegative)
  [/\[\]/y,      'placeholder'],  // "[]"
  [/\/\//y,      'fraction_bar'],  // "//"
  [/<=|>=/y,     'relation'],
  [/=|!=|<|>/y,  'relation'],  // =, !=, < etc.
  [/[A-Za-z]+/y, 'ident'],
  [/\s+/y,       'whitespace'],
  [/\@/y,        'special_constant'],  // @ = pi
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

// LaTeX built-in functions that can be entered directly in
// math-entry mode.  They have the same LaTeX command name as
// the entered function name.
// TODO: Still need to handle csch/sech and other exceptions (maybe erf/erfc).
const latex_unary_builtins = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'sinh', 'cosh', 'tanh' /* sech, csch */ , 'coth',
  'exp', 'ln', 'log', 'lg',
  'arg', 'det', 'dim', 'deg', 'hom', 'ker', 'min', 'max', 'sup'
]);
  

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
    this.filter_whitespace();
  }

  filter_whitespace() {
    this.tokens = this.tokens.filter(
      token => token.type !== 'whitespace');
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
    if(this.at_end())
      return this.parse_error();
    else
      return this.tokens[this.token_index++];
  }

  // TODO: revisit; rename -> .error()
  parse_error() { throw new Error('parse_error'); }
}


// Parser for infix math text entry.
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
       lhs.expr.is_text_expr() &&
       latex_unary_builtins.has(lhs.expr.text))
      return new CommandExpr(lhs.expr.text, [rhs]);  // sin x, etc.
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
    let token;
    if(initial_factor) {
      if((token = this.consume('number')) !== null)
        return TextExpr.integer(token.text);
    }
    if((token = this.consume('ident')) !== null) {
      const greek_letter = this.convert_greek_letter(token.text);
      if(greek_letter)
        return greek_letter;
      if(token.text.length === 1)
        return new TextExpr(token.text);  // single-letter variable
      else  // multi-letter variable
        return FontExpr.roman_text(token.text);
    }
    if((token = this.consume('special_constant')) !== null) {
      if(token.text === '@')
        return new CommandExpr('pi');
      else return new TextExpr('???');  // shouldn't happpen
    }
    if((token = this.consume('placeholder')) !== null)
      return new PlaceholderExpr();
    if((token = this.consume('left_paren', 'left_bracket', 'left_brace')) != null) {
      const [closing_delim_type, left, right] =
            this.matching_closing_delimiter_info(token.type);
      const inner_expr = this.parse_expr() || this.parse_error();
      const closing_token = this.consume('right_paren', 'right_bracket', 'right_brace');
      if(!(closing_token && closing_token.type === closing_delim_type))
        return this.parse_error();
      return new DelimiterExpr(left, right, inner_expr);
    }
    return null;
  }

  // alpha -> CommandExpr('alpha') etc.
  convert_greek_letter(text) {
    if(latex_letter_commands.has(text))
      return new CommandExpr(text);
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


export { ExprParser };

