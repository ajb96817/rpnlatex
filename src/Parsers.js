

import {
  Expr, TextExpr, CommandExpr, SequenceExpr, DelimiterExpr,
  SubscriptSuperscriptExpr, InfixExpr, PrefixExpr, PostfixExpr,
  FontExpr, PlaceholderExpr, FunctionCallExpr, ArrayExpr,
  TensorExpr, SymPyExpr
} from './Exprs';


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
  [/=|!=|<|>|<=|>=/y,  'relation'],  // =, !=, < etc.
  [/\w+/y,       'ident'],
  [/\s+/y,       'whitespace'],
  [/\@/y,        'special_constant'],  // @ = pi
  [/-/y,         'minus'],
  [/\+/y,        'plus'],
  [/\!/y,        'factorial'],
  [/\*/y,        'multiply'],
  [/\//y,        'divide'],
  [/\(/y,        'left_paren'],
  [/\)/y,        'right_paren'],
  [/\[/y,        'left_bracket'],
  [/\]/y,        'right_bracket'],
  [/\{/y,        'left_brace'],
  [/\}/y,        'right_brace']
];


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


// equation:  (x == y expression, or an expr by itself)
//     expr
//     expr [=, >=, etc] expr
// expr:  (additive expression)
//     term
//     term [+, -] term
// term:  (multiplicative expression)
//     factor |
//     factor [*, /, //] factor
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
      const expr = parser.parse_expr(); // parser.parse_equation();
      if(!expr) return null;
      // Should not have any extraneous tokens at the end.
      if(!parser.at_end()) return null;
      return expr;
    }
    else
      return null;  // TODO: report error
  }
  
  parse_equation() {
    // TODO
    return null;
  }

  parse_expr() {
    const lhs = this.parse_term() || this.parse_error();
    let result_expr = lhs;
    const binary_token = this.consume('plus', 'minus');
    if(binary_token) {
      const rhs = this.parse_expr() || this.parse_error();
      return InfixExpr.combine_infix(
        lhs, rhs,
        Expr.text_or_command(binary_token.text));
    }
    return lhs;
  }

  parse_term() {
    const lhs = this.parse_factor();
    if(!lhs) return null;
    const op_token = this.consume('multiply', 'divide', 'fraction_bar');
    if(op_token) {
      if(op_token.type === 'fraction_bar') {
        // Full-size fraction.
        const rhs = this.parse_term() || this.parse_error();
        return new CommandExpr('frac', [
          this._remove_outer_parenthesis(lhs),
          this._remove_outer_parenthesis(rhs)]);
      }
      else {
        // Explicit multiplication converts to \cdot
        const op_text = (op_token.type === 'multiply' ? "\\cdot" : '/');
        const rhs = this.parse_term() || this.parse_error();
        return InfixExpr.combine_infix(
          lhs, rhs, Expr.text_or_command(op_text));
      }
    }
    // TODO: implicit products

    return lhs;  // factor by itself
  }

  // Meant for removing the outer ()-parens (only) from numerator/denominator
  // of a full-size fraction.  We want (x+1)//(x+2) => \frac{x+1}{x+2}.
  _remove_outer_parenthesis(expr) {
    if(expr.is_delimiter_expr() && expr.has_types('(', ')'))
      return expr.inner_expr;
    else
      return expr;
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
    let expr = null;
    // if(allow_unary_minus) {
    //   // NOTE: double unary minus not allowed (--3).
    //   const negate_token = this.peek_for('operator');
    //   if(negate_token && negate_token.text === '-') {
    //     this.next_token();
    //     expr = this.parse_factor_(false);
    //     if(expr) return PrefixExpr.unary_minus(expr);
    //     else return null;
    //   }
    // }
    let token = null;
    if((token = this.consume('number')) !== null)
      return TextExpr.integer(token.text);
    if((token = this.consume('ident')) !== null)
      return new TextExpr(token.text);
    // else if(this.peek_for('pi')) {
    //   this.next_token();
    //   return new CommandExpr('pi');
    // }
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
