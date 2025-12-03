
// Old/unused code kept around for future reference.


// Manage state of importing/exporting zip archives.
class ImportExportState {
  constructor() {
    // States:
    //   'idle' - if this.download_url is populated, an export download is ready
    //   'error' - export failed, this.error_message is populated
    //   'loading' - in the process of loading from the database cursor
    //   'zipping' - creation of zip file in progress
    //   'uploading' - user is uploading an archive zipfile
    //   'importing' - uploaded zipfile is being processed/imported
    this.state = 'idle';

    this.document_storage = null;  // will be initialized by AppState

    // Number of imported documents handled so far.
    this.import_count = 0;

    // Number of failures noted this import (if >0, this.error_message will also be set).
    this.failed_count = 0;
    this.error_message = null;

    // Holds the last-generated blob download URL, if any.
    this.download_url = null;

    // This will be set on a successful import.
    this.import_result_string = null;

    // This will be set to true if the main file list (FileManagerState) needs to be refreshed from the DB.
    this.file_list_needs_update = false;

    // This can be set to a function to monitor state changes.
    this.onstatechange = null;
  }

  // TODO: -> state_description()
  textual_state() {
    switch(this.state) {
    case 'idle': return this.download_url ? 'Download ready' : 'Ready for export or import';
    case 'error': return 'Error: ' + this.error_message;
    case 'loading': return 'Extacting database...';
    case 'zipping': return 'Compressing files...';
    case 'uploading': return 'Uploading data...';
    case 'importing': return 'Importing documents: ' + this.import_count + ' so far';
    default: return '???';
    }
  }

  download_available() {
    return this.state === 'idle' && this.download_url;
  }

  generate_download_filename() {
    const date = new Date();
    return [
      'rpnlatex_', date.getFullYear().toString(), '_',
      date.toLocaleString('default', {month: 'short'}).toLowerCase(),
      '_', date.getDate().toString().padStart(2, '0'), '.zip'
    ].join('');
  }

  change_state(new_state) {
    this.state = new_state;
    if(this.onstatechange)
      this.onstatechange(this);
  }
  
  start_exporting() {
    let document_storage = this.document_storage;
    this.zip = new JSZip();
    document_storage.fetch_all_documents(
      (row) => this.add_document_json_to_zip(row),
      () => this.start_compressing(),
      () => {
        this.error_message = 'Unable to export the document database.';
        this.change_state('error');
      });
    this.change_state('loading');
  }

  add_document_json_to_zip(json) {
    this.zip.file(json.filename + '.json', JSON.stringify(json));
  }

  start_compressing() {
    this.change_state('zipping');
    this.zip.generateAsync({type: 'blob'}).then(content_blob => {
      this.finished_compressing(content_blob);
    });
  }

  clear_download_url() {
    if(this.download_url) {
      URL.revokeObjectURL(this.download_url);
      this.download_url = null;
    }
  }

  finished_compressing(content_blob) {
    this.clear_download_url();
    this.download_url = URL.createObjectURL(content_blob);
    this.zip = null;
    this.change_state('idle');
  }

  // zipfile is a File object from a <input type="file"> element.
  start_importing(zipfile) {
    this.clear_download_url();
    this.import_result_string = null;
    if(zipfile.type !== 'application/zip') {
      alert('Import files must be zip archives.');
      return;
    }
    this.change_state('uploading');
    let reader = new FileReader();
    reader.addEventListener(
      'load',
      event => this.process_uploaded_data(event.target.result));
    reader.readAsArrayBuffer(zipfile);
  }

  process_uploaded_data(data) {
    this.import_count = 0;
    this.failed_count = 0;
    this.error_message = null;
    this.change_state('importing');
    JSZip.loadAsync(data).then(zipfile => {
      let promises = [];
      for(let filename in zipfile.files) {
        const file = zipfile.files[filename];
        if(filename.endsWith('.json')) {
          promises.push(
            file.async('string').then(
              content => this.import_file(file.name.slice(0, file.name.length-5), content)));
        }
        else {
          this.error_message = 'Invalid filename in archive: ' + filename;
          this.failed_count++;
        }
      }
      Promise.all(promises).then(
        () => {
          if(this.failed_count > 0)
            this.import_result_string = 'Errors encountered: ' + this.error_message;
          else
            this.import_result_string = 'Successfully imported ' + this.import_count + ' document' + (this.import_count === 1 ? '' : 's');
          this.change_state('idle');
          this.file_list_needs_update = true;
        });
    });
  }

  import_file(filename, content) {
    let document_storage = this.document_storage;
    let parsed, app_state;
    try {
      parsed = JSON.parse(content);
      app_state = AppState.from_json(parsed);
    } catch(e) {
      this.error_message = 'Invalid document found in zip file: ' + filename;
      this.failed_count++;
      return;
    }
    document_storage.save_state(app_state, filename);
    this.import_count++;
    this.change_state('importing');
  }

  import_json_file(filename, content) {
    let document_storage = this.document_storage;
    let parsed, app_state;
    try {
      parsed = JSON.parse(content);
      app_state = AppState.from_json(parsed);
    } catch(e) {
      alert('Invalid .json file: ' + filename);
      return;
    }
    document_storage.save_state(app_state, filename);
  }
}



// Parse simple "algebraic" snippets, for use in math_entry mode.
//
// NOTE: This has been superseded by Algebrite's expression parser,
// but may want to come back to this eventually.
//
// Rules:
//   - Spaces are ignored except to separate numbers.
//   - "Symbols" are one-letter substrings like 'x'.
//   - As a special case, '@' becomes \pi.
//   - Adjacent factors are combined with implicit multiplication.
//     'xyz' is considered implicit multiplication of x,y,z.
//   - '*' is multiplication, but gets converted to \cdot.
//   - '/' and '*' bind tighter than '+' and '-'.
//   - Delimiters can be used, but must match properly; e.g. 10[x+(y-3)]
//   - Postfix factorial and "prime" (y'') notation is allowed.
//   - Scientific notation such as 3e-4 is handled as a special case.
//   - Placeholders can be inserted with [].
//   - Negative constants such as -10 are handled by the "- factor" production
//     below; that is the reason for the allow_unary_minus flag being passed
//     around.  The implicit multiplication rule would otherwise make things
//     like '2-3' be parsed as '2*(-3)'.
//
// Mini-grammar:
//   expr:
//       term |
//       term '+' expr
//       term '-' expr(!allow_unary_minus)
//   term:
//       factor |
//       factor '*','/' term(allow_unary_minus)
//       factor term      (implicit multiplication)
//   factor:
//       number |
//       symbol |
//       pi |             (special case '@' syntax)
//       '(' expr ')' |   (delimiter types must match)
//       '-' factor |     (unary minus, only if factor(allow_unary_minus))
//       factor '!' |     (factorial notation)
//       factor "'" |     (prime notation)
//       
//       []               (placeholder)
//
class ExprParser {
  static parse_string(string) {
    const tokens = this.tokenize(string);
    if(!tokens) return null;
    let parser = new ExprParser(tokens);
    let expr = null;
    try {
      expr = parser.parse_expr(true);
    } catch(e) {
      if(e.message === 'parse_error')
        ;  // leave expr as null
      else
        throw e;
    }
    if(!expr) return null;
    if(!parser.at_end()) return null;  // extraneous tokens at end
    return expr;
  }
  
  // Break string into tokens; token types are:
  //   number: 3, 3.1, etc.
  //     NOTE: negative numbers are handled by the "- factor" production in the grammar
  //   symbol: x (xyz becomes 3 separate symbols)
  //   pi: @ -> \pi (special case)
  //   operator: +, -, *, /, //, !, '
  //   open_delimiter: ( or [ or {
  //   close_delimiter: ) or ] or }
  static tokenize(s) {
    let pos = 0;
    let tokens = [];
    let number_regex = /\d*\.?\d+/g;
    while(pos < s.length) {
      // Check for number:
      number_regex.lastIndex = pos;
      const result = number_regex.exec(s);
      if(result && result.index === pos) {
        tokens.push({type: 'number', text: result[0], pos: pos});
        pos += result[0].length;
      }
      // Check for [] placeholder:
      else if(pos < s.length-1 && s[pos] === '[' && s[pos+1] === ']') {
        tokens.push({type: 'placeholder', text: '[]', pos: pos});
        pos += 2;
      }
      // Check for // (full size fraction):
      else if(pos < s.length-1 && s[pos] === '/' && s[pos+1] === '/') {
        tokens.push({type: 'operator', text: '//', pos: pos});
        pos += 2;
      }
      else {
        // All other tokens are always 1 character.
        const token = s[pos];
        let token_type = null;
        if(/\s/.test(token)) token_type = 'whitespace';
        else if(/\w/.test(token)) token_type = 'symbol';
        else if(/[-+!'/*]/.test(token)) token_type = 'operator';
        else if(/[([{]/.test(token)) token_type = 'open_delimiter';
        else if(/[)\]}]/.test(token)) token_type = 'close_delimiter';
        else if(token === '@') token_type = 'pi';
        if(token_type === null)
          return null;  // invalid token found (something like ^, or unicode)
        if(token_type !== 'whitespace')  // skip whitespace
          tokens.push({type: token_type, text: token, pos: pos});
        pos++;
      }
    }
    return tokens;
  }

  constructor(tokens) {
    this.tokens = tokens;
    this.token_index = 0;
  }

  parse_expr(allow_unary_minus) {
    const lhs = this.parse_term(allow_unary_minus) || this.parse_error();
    let result_expr = lhs;
    const binary_token = this.peek_for('operator');
    if(binary_token &&
       (binary_token.text === '+' || binary_token.text === '-')) {
      this.next_token();
      const allow_unary_minus = binary_token.text === '+';
      const rhs = this.parse_expr(allow_unary_minus) || this.parse_error();
      // Special case: check for scientific notation with a negative exponent.
      // 4e-3 is initially parsed as (4e)-(3); convert this specific case
      // into scientific notation.
      // Nonnegative exponents are instead parsed as 4e3 -> 4 (e3) and
      // are handled in parse_term.
      if(lhs.is_sequence_expr() && lhs.exprs.length === 2 &&
         lhs.exprs[0].is_text_expr_with_number() &&
         lhs.exprs[1].is_text_expr() &&
         ['e', 'E'].includes(lhs.exprs[1].text) &&
         rhs.is_text_expr_with_number()) {
        // NOTE: 3e+4 (explicit +) is allowed here for completeness.
        const exponent_text = binary_token.text === '-' ? ('-' + rhs.text) : rhs.text;
        result_expr = InfixExpr.combine_infix(
          lhs.exprs[0],
          TextExpr.integer(10).with_superscript(exponent_text),
          new CommandExpr('cdot'));
      }
      else result_expr = InfixExpr.combine_infix(
        lhs, rhs, Expr.text_or_command(binary_token.text));
    }
    return result_expr;
  }

  parse_term(allow_unary_minus) {
    const lhs = this.parse_factor(allow_unary_minus);
    if(!lhs) return null;
    const op_token = this.peek_for('operator');
    if(op_token && (op_token.text === '*' || op_token.text === '/')) {
      // Explicit multiplication converts to \cdot
      const op_text = (op_token.text === '*' ? "\\cdot" : '/');
      this.next_token();
      const rhs = this.parse_term(true) || this.parse_error();
      return InfixExpr.combine_infix(
        lhs, rhs, Expr.text_or_command(op_text));
    }
    if(op_token && op_token.text === '//') {
      // Full-size fraction.
      this.next_token();
      const rhs = this.parse_term(true) || this.parse_error();
      return new CommandExpr('frac', [lhs, rhs]);
    }
    // Try implicit multiplication: 'factor term' production.
    const rhs = this.parse_term(false);  // NOTE: not an error if null
    if(rhs) {
      // Combining rules for implicit multiplication:
      //   number1 number2      -> number1 \cdot number2
      //   number1 a \cdot b    -> number1 \cdot a \cdot b
      //   number1 E|e number2  -> number1 \cdot 10^number2 (scientific notation)
      // Any other pair just concatenates.
      const cdot = Expr.text_or_command("\\cdot");
      if(lhs.is_text_expr_with_number() &&
         rhs.is_text_expr_with_number())
        return InfixExpr.combine_infix(lhs, rhs, cdot);
      else if(rhs.is_infix_expr() &&
              rhs.operator_exprs.every(expr => rhs.operator_text(expr) === 'cdot'))
        return InfixExpr.combine_infix(lhs, rhs, cdot);
      else if(rhs.is_sequence_expr() &&
              rhs.exprs.length === 2 &&
              rhs.exprs[1].is_text_expr_with_number() &&
              rhs.exprs[0].is_text_expr() &&
              ['e', 'E'].includes(rhs.exprs[0].text) &&
              lhs.is_text_expr_with_number()) {
        // Scientific notation with nonnegative exponent (e.g. prepending a number to "e4").
        // Negative exponents are handled in parse_expr instead.
        return InfixExpr.combine_infix(
          lhs,
          TextExpr.integer(10).with_superscript(rhs.exprs[1]),
          new CommandExpr('cdot'));
      }
      else
        return Expr.combine_pair(lhs, rhs, true /* no_parenthesize */);
    }
    else
      return lhs;  // factor by itself
  }

  parse_factor(allow_unary_minus) {
    let factor = this.parse_factor_(allow_unary_minus);
    while(factor) {
      // Process one or more postfix ! or ' (prime) tokens if present.
      const op_token = this.peek_for('operator');
      if(op_token && op_token.text === '!') {
        this.next_token();
        factor = Expr.combine_pair(factor, new TextExpr('!'));
      }
      else if(op_token && op_token.text === '\'') {
        this.next_token();
        factor = factor.with_prime(true);
      }
      else break;
    }
    return factor;
  }

  parse_factor_(allow_unary_minus) {
    let expr = null;
    if(allow_unary_minus) {
      // NOTE: double unary minus not allowed (--3).
      const negate_token = this.peek_for('operator');
      if(negate_token && negate_token.text === '-') {
        this.next_token();
        expr = this.parse_factor_(false);
        if(expr) return PrefixExpr.unary_minus(expr);
        else return null;
      }
    }
    if(this.peek_for('number'))
      return TextExpr.integer(this.next_token().text);
    else if(this.peek_for('symbol'))
      return new TextExpr(this.next_token().text);
    else if(this.peek_for('pi')) {
      this.next_token();
      return new CommandExpr('pi');
    }
    else if(this.peek_for('placeholder')) {
      this.next_token();
      return new PlaceholderExpr();
    }
    else if(this.peek_for('open_delimiter')) {
      const open_delim_type = this.next_token().text;
      const inner_expr = this.parse_expr(true) || this.parse_error();
      if(!this.peek_for('close_delimiter'))
        return this.parse_error();
      const close_delim_type = this.next_token().text;
      if(this.matching_closing_delimiter(open_delim_type) !== close_delim_type)
        return this.parse_error();  // mismatched delimiters
      let [left, right] = [open_delim_type, close_delim_type];
      if(open_delim_type === '{')
        [left, right] = ["\\{", "\\}"];  // latex-compatible form
      return new DelimiterExpr(left, right, inner_expr);
    }
    else
      return null;
  }

  matching_closing_delimiter(open_delim) {
    if(open_delim === '(') return ')';
    else if(open_delim === '[') return ']';
    else if(open_delim === '{') return '}';
    else return null;
  }

  peek_for(token_type) {
    if(this.at_end())
      return null;
    if(this.tokens[this.token_index].type === token_type)
      return this.tokens[this.token_index];
    else
      return null;
  }
  
  next_token() {
    if(this.at_end())
      return this.parse_error();
    else {
      this.token_index++;
      return this.tokens[this.token_index-1];
    }
  }

  at_end() {
    return this.token_index >= this.tokens.length;
  }

  parse_error() { throw new Error('parse_error'); }
}


// NOTE: SpecialFunctions is now handled by Algebrite, but keeping this around
// in case we stop using it.

class SpecialFunctions {
  static factorial(x) {
    if(x >= 0 && this.is_integer(x)) {
      if(x <= 1) return 1;
      if(x > 20) return Infinity;
      let value = 1;
      for(let i = 2; i <= x; i++)
        value *= i;
      return value;
    }
    else
      return this.gamma(x+1);
  }

  static gamma(x) {
    const g = 7;
    const C = [
      0.99999999999980993, 676.5203681218851, -1259.1392167224028,
      771.32342877765313, -176.61502916214059, 12.507343278686905,
      -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if(x <= 0)
      return NaN;
    if(x < 0.5)
      return Math.PI / (Math.sin(Math.PI*x) * this.gamma(1-x));
    x -= 1;
    let y = C[0];
    for(let i = 1; i < g+2; i++)
      y += C[i] / (x + i);
    const t = x + g + 0.5;
    const result = Math.sqrt(2*Math.PI) * Math.pow(t, x+0.5) * Math.exp(-t) * y;
    return isNaN(result) ? Infinity : result;
  }

  // Basic iterative evaluation of double factorial.
  // 7!! = 7*5*3*1, 8!! = 8*6*4*2, 0!! = 1
  // x must be a nonnegative integer and its magnitude is limited to something reasonable
  // to avoid long loops or overflow.
  static double_factorial(x) {
    if(!this.is_integer(x) || x < 0) return NaN;
    if(x > 100) return Infinity;
    let result = 1;
    while(x > 1) {
      result *= x;
      x -= 2;
    }
    return result;
  }

  static is_integer(x) {
    return x === Math.floor(x);
  }

  static binom(n, k) {
    // k must be a nonnegative integer, but n can be anything
    if(!this.is_integer(k) || k < 0) return null;
    if(k > 1000) return NaN;  // Limit loop length below
    // Use falling factorial-based algorithm n_(k) / k!
    let value = 1;
    for(let i = 1; i <= k; i++)
      value *= (n + 1 - i) / i;
    if(this.is_integer(n)) {
      // Resulting quotient is an integer mathematically if n is,
      // but round it because of the limited floating point precision.
      return Math.round(value);
    }
    else
      return value;
  }
}

