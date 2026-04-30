

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
  [/[A-Za-z]+/y,       'ident'],
  [/\s+/y,       'whitespace'],
  [/\@/y,        'special_constant'],  // @ = pi
  [/-/y,         'minus'],
  [/\+/y,        'plus'],
  [/,/y,         'comma'],
  [/\!/y,        'factorial'],
  [/'/y,         'prime'],
  [/\*/y,        'multiply'],
  [/\//y,        'divide'],
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
    if(token_types.includes(this.tokens[this.token_index].type))
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


// Expr parser for infix math text entry.
//
// equation:  (x = y expression, or an expr by itself)
//     expr
//     expr [=, >=, etc] equation
// expr:  (additive expression)
//     term
//     term [+, -, ','] expr
// term:  (multiplicative expression)
//     factor |
//     factor [*, /, //] term
//     coefficient term  (implicit product)
// coefficient:  (something that can be the LHS of an implicit product)
//     number
//     '-' coefficient  (unary minus)
//     '(' expr ')'  (delimiter types must match)
// factor:  (primary expression)
//     coefficient
//     ident
//     special_constant
//     placeholder
//     factor [!, ']  (factorial or prime)
//     '-' factor  ("duplicate" of coefficient '-' rule)
//
// TODO: scientific notation

class ExprParser2 extends Parser {
  static parse_string(s) {
    const result = Tokenizer.tokenize_expr(s);
    if(result.success) {
      const parser = new this(result.tokens);
      const expr = parser.parse_equation();
      if(!expr) return null;
      // Should not have any extraneous tokens at the end.
      if(!parser.at_end()) return null;
      return expr;
    }
    else
      return null;  // TODO: report error
  }
  
  parse_equation() {
    const lhs = this.parse_expr() || this.parse_error();
    const relation_token = this.consume('relation');
    if(relation_token) {
      const rhs = this.parse_equation() || this.parse_error();
      return InfixExpr.combine_infix(
        lhs, rhs,
        this._relation_to_infix_op(relation_token.text));
    }
    return lhs;
  }

  _relation_to_infix_op(relation) {
    switch(relation) {
    case '<=': return new CommandExpr('le');
    case '>=': return new CommandExpr('ge');
    case '!=': return new CommandExpr('ne');
    default: return new TextExpr(relation);  // = > <
    }
  }

  parse_expr() {
    const lhs = this.parse_term() || this.parse_error();
    let result_expr = lhs;
    const binary_token = this.consume('plus', 'minus', 'comma');
    if(binary_token) {
      const rhs = this.parse_expr() || this.parse_error();
      return InfixExpr.combine_infix(
        lhs, rhs,
        Expr.text_or_command(binary_token.text));
    }
    return lhs;
  }

  parse_term() {
    let lhs = this.parse_coefficient();
    if(lhs) {
      const implicit_product_term = this.parse_term();
      if(implicit_product_term)
        return this._combine_implicit_product(lhs, implicit_product_term);
      else
        ;  // keep lhs coefficient as is (as a 'factor' term)
    }
    else
      lhs = this.parse_factor();
    if(!lhs) return null;
    const op_token = this.consume('multiply', 'divide', 'fraction_bar');
    if(op_token) {
      const rhs = this.parse_term() || this.parse_error();
      if(op_token.type === 'fraction_bar') {
        // Full-size fraction.
        return new CommandExpr('frac', [
          this._remove_outer_parenthesis(lhs),
          this._remove_outer_parenthesis(rhs)]);
      }
      else {
        // Explicit multiplication converts to \cdot
        const op_text = (op_token.type === 'multiply' ? "\\cdot" : '/');
        return InfixExpr.combine_infix(
          lhs, rhs, Expr.text_or_command(op_text));
      }
    }
    return lhs;  // factor by itself
  }

  _combine_implicit_product(lhs, rhs) {
    const cdot = Expr.text_or_command("\\cdot");
    if(lhs.is_text_expr_with_number() &&
       rhs.is_text_expr_with_number())
      return InfixExpr.combine_infix(lhs, rhs, cdot);
    else if(rhs.is_infix_expr() &&
            rhs.operator_exprs.every(expr => rhs.operator_text(expr) === 'cdot'))
      return InfixExpr.combine_infix(lhs, rhs, cdot);
    else if(lhs.is_font_expr() && lhs.typeface === 'roman' &&
            lhs.expr.is_text_expr() && latex_unary_builtins.has(lhs.expr.text))
      return new CommandExpr(lhs.expr.text, [rhs]);  // sin x, etc.
    else if(rhs.is_delimiter_expr() && !lhs.is_delimiter_expr())
      return new FunctionCallExpr(lhs, rhs);  // f(x)
    // else if(rhs.is_sequence_expr() &&
    //         rhs.exprs.length === 2 &&
    //         rhs.exprs[1].is_text_expr_with_number() &&
    //         rhs.exprs[0].is_text_expr() &&
    //         ['e', 'E'].includes(rhs.exprs[0].text) &&
    //         lhs.is_text_expr_with_number()) {
    //   // Scientific notation with nonnegative exponent (e.g. prepending a number to "e4").
    //   // Negative exponents are handled in parse_expr instead.
    //   return InfixExpr.combine_infix(
    //     lhs,
    //     TextExpr.integer(10).with_superscript(rhs.exprs[1]),
    //     new CommandExpr('cdot'));
    // }
    else
      return Expr.concatenate(lhs, rhs, true /* no_parenthesize */);
  }

  // Meant for removing the outer ()-parens (only) from numerator/denominator
  // of a full-size fraction.  We want (x+1)//(x+2) => \frac{x+1}{x+2}.
  _remove_outer_parenthesis(expr) {
    if(expr.is_delimiter_expr() && expr.has_types('(', ')'))
      return expr.inner_expr;
    else
      return expr;
  }

  parse_coefficient() {
    let token = null;
    if((token = this.consume('number')) !== null)
      return TextExpr.integer(token.text);
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
    if((token = this.consume('minus')) !== null) {
      const negated_expr = this.parse_coefficient();
      if(!negated_expr)
        return this.parse_error();
      return PrefixExpr.unary_minus(negated_expr);
    }
    return null;
  }

  parse_factor() {
    let factor = this._parse_factor();
    while(factor) {
      // Process one or more postfix ! or ' (prime) tokens if present.
      if(this.consume('factorial'))
        factor = Expr.concatenate(factor, new TextExpr('!'));
      else if(this.consume('prime'))
        factor = factor.with_prime(true);
      else break;
    }
    return factor;
  }

  _parse_factor() {
    let token = null;
    if((token = this.consume('minus')) !== null) {
      const negated_expr = this.parse_factor();
      if(!negated_expr)
        return this.parse_error();
      return PrefixExpr.unary_minus(negated_expr);
    }
    const coefficient_expr = this.parse_coefficient();
    if(coefficient_expr)
      return coefficient_expr;
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


export { ExprParser2 };  // temporary
