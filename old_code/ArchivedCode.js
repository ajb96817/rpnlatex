
// Old/unused code kept around for future reference.


// Conversion of any floating-point values in an Expr to (approximate)
// rational fractions or rational multiples of common numbers like sqrt(2).
class RationalizeToExpr {
  static rationalize_expr(expr, full_size_fraction = true) {
    return new this(full_size_fraction).rationalize_expr(expr);
  }
  
  static rationalize(value, full_size_fraction = true) {
    return new this(full_size_fraction).value_to_expr(value);
  }

  constructor(full_size_fraction) {
    this.full_size_fraction = full_size_fraction;
  }
  
  rationalize_expr(expr) {
    const rationalized_expr = this._try_rationalize_real_expr(expr);
    if(rationalized_expr)
      return rationalized_expr;
    // Check subexpressions recursively.
    return expr.subexpressions()
      .reduce((new_expr, subexpression, subexpression_index) =>
        new_expr.replace_subexpression(
          subexpression_index,
          this.rationalize_expr(subexpression)),
        expr);
  }

  _try_rationalize_real_expr(expr) {
    let negated = false;
    if(expr.is_unary_minus_expr()) {
      negated = true;
      expr = expr.base_expr;
    }
    if(expr.is_text_expr() && expr.looks_like_floating_point()) {
      let value = parseFloat(expr.text);
      if(!isNaN(value)) {
        if(negated) value *= -1.0;
        return this.value_to_expr(value);
      }
    }
    return null;
  }
  
  // Try to find a close rational approximation to a floating-point
  // value, or up to a rational factor of some common constants
  // like sqrt(2) or pi.  Return an Expr if successful, otherwise null.
  value_to_expr(value) {
    let result = null;
    const make_sqrt = expr => new CommandExpr('sqrt', [expr]);
    const pi_expr = new CommandExpr('pi');
    const two_pi_expr = Expr.concatenate(this._int_to_expr(2), pi_expr);
    // Don't try to rationalize anything too large in magnitude.
    if(Math.abs(value) > 1e8)
      return null;
    // Check for very small fractional part; could be either an integer,
    // or a float with large magnitude and thus decayed fractional precision.
    if(Math.abs(value % 1.0) < 1e-6)
      return this._int_to_expr(value);
    // Try different variations on \pi
    // NOTE: pi is a little weird because a close rational approximation 
    // (355/113) both has small denominator and is very close to the actual
    // value of pi.  So the epsilon value in _try_rationalize_with_factor()
    // needs to be chosen carefully.
    result = this._try_rationalize_with_factor(  // pi^2
      value, Math.PI*Math.PI,
      pi_expr.with_superscript(this._int_to_expr(2)));
    result ||= this._try_rationalize_with_factor(  // pi
      value, Math.PI, pi_expr, null);
    result ||= this._try_rationalize_with_factor(  // 1/pi
      value, 1/Math.PI, null, pi_expr);
    result ||= this._try_rationalize_with_factor(  // sqrt(pi)
      value, Math.sqrt(Math.PI), make_sqrt(pi_expr), null);
    result ||= this._try_rationalize_with_factor(  // 1 / \sqrt(pi)
      value, 1/Math.sqrt(Math.PI), null, make_sqrt(pi_expr));
    result ||= this._try_rationalize_with_factor(  // \sqrt(2pi)
      value, Math.sqrt(2*Math.PI), make_sqrt(two_pi_expr), null);
    result ||= this._try_rationalize_with_factor(  // 1 / \sqrt(2pi)
      value, 1/Math.sqrt(2*Math.PI), null, make_sqrt(two_pi_expr));
    // Try factors of ln(2).
    result ||= this._try_rationalize_with_factor(
      value, Math.log(2), new CommandExpr('ln', [this._int_to_expr(2)]), null);
    // Try sqrt(n) in the numerator for small square-free n.
    // No need to check denominators since, e.g. 1/sqrt(3) = sqrt(3)/3
    for(const factor of [2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19])
      result ||= this._try_rationalize_with_factor(
        value, Math.sqrt(factor),
        make_sqrt(this._int_to_expr(factor)), null);
    // Try golden ratio-like factors.
    result ||= this._try_rationalize_with_factor(
      value, 1+Math.sqrt(5),
      InfixExpr.add_exprs(this._int_to_expr(1), make_sqrt(this._int_to_expr(5))),
      null);
    result ||= this._try_rationalize_with_factor(
      value, Math.sqrt(5)-1,  // NOTE: keep positive sign, 1-sqrt(5) is negative
      InfixExpr.combine_infix(
        make_sqrt(this._int_to_expr(5)),
        this._int_to_expr(1),
        new TextExpr('-')),
      null);
    // NOTE: factors of e^n (n!=0) are rare in isolation so don't test for them here.
    // Finally, rationalize the number itself with no factors.
    result ||= this._try_rationalize_with_factor(value, 1.0, null, null);
    return result;
  }

  // Helper for rationalize_to_expr().
  // Try to pull out rational multiples of 'factor' using Farey fractions.
  // If successful, return the factored rational expression,
  // multiplied by 'numer_factor_expr' in the numerator or
  // 'denom_factor_expr' in the denominator if they are given.
  // If no rationalization close enough can be found, return null.
  _try_rationalize_with_factor(value, factor, numer_factor_expr, denom_factor_expr) {
    const x = value / factor;
    const max_denom = 1000;  // maximum denominator tolerated
    const epsilon = 0.00000001;  // maximum deviation from true value tolerated
    const sign = Math.sign(value);
    const x_abs = Math.abs(x);
    const [integer_part, fractional_part] = [Math.floor(x_abs), x_abs % 1.0];
    const [numer, denom] = this._rationalize(fractional_part, max_denom);
    const rationalized_value = numer/denom;
    if(Math.abs(rationalized_value - fractional_part) < epsilon) {
      // This is a close enough rational approximation that it can be considered exact.
      const final_numer = integer_part*denom + numer;
      const final_denom = denom;
      let final_expr = null;
      if(final_denom === 1) {
        // Integer multiple of the factor.
        const base_expr = this._int_to_expr(final_numer*sign);
        if(numer_factor_expr) {
          if(final_numer === 1) {
            if(sign < 0)
              final_expr = PrefixExpr.unary_minus(numer_factor_expr);
            else final_expr = numer_factor_expr;
          }
          else final_expr = Expr.concatenate(base_expr, numer_factor_expr);
        }
        else if(denom_factor_expr)
          final_expr = CommandExpr.frac(base_expr, denom_factor_expr);
        else
          final_expr = base_expr;
      }
      else {
        // Rational (but not integer) multiple of the factor.
        let numer_expr = this._int_to_expr(final_numer);
        if(numer_factor_expr) {
          if(final_numer === 1)
            numer_expr = numer_factor_expr;
          else
            numer_expr = Expr.concatenate(numer_expr, numer_factor_expr);
        }
        let denom_expr = this._int_to_expr(final_denom);
        if(denom_factor_expr)
          denom_expr = Expr.concatenate(denom_expr, denom_factor_expr);
        const frac_expr = CommandExpr.frac(numer_expr, denom_expr);
        if(sign < 0)
          final_expr = PrefixExpr.unary_minus(frac_expr);
        else final_expr = frac_expr;
      }
      return final_expr;
    }
    else
      return null;  // not close enough to a rational multiple of factor
  }

  // Farey fraction algorithm.  Find closest rational approximation to
  // 0 <= x <= 1, with maximum denominator max_denom.
  // Returns [numerator, denominator].
  _rationalize(x, max_denom) {
    const epsilon = 1e-6;
    let [a, b, c, d] = [0, 1, 1, 1];
    while(b <= max_denom && d <= max_denom) {
      const mediant = (a+c) / (b+d);
      if(Math.abs(x - mediant) <= epsilon) {
        if(b + d <= max_denom)
          return [a+c, b+d];
        else if(d > b)
          return [c, d];
        else
          return [a, b];
      }
      else if(x > mediant)
        [a, b] = [a+c, b+d];
      else
        [c, d] = [a+c, b+d];
    }
    if(b > max_denom)
      return [c, d];
    else
      return [a, b];
  }

  // If we "know" x should be an integer (e.g. as part of a rationalized fraction),
  // this function is used to try to show it without any decimal part.
  // Very large values are shown in scientific notation.
  _int_to_expr(x) {
    if(isNaN(x))
      return FontExpr.roman_text('NaN');
    else if(Math.abs(x) > 1e12)
      return double_to_expr(x);  // use scientific notation
    else
      return TextExpr.integer(Math.round(x));
  }
}


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


// Scan an expression and try to find the variable to use for the
// "implicit variable" for SymPy commands like [#][d] (derivative).
// Returns [variable_name_string, variable_expr].
// If no variable is found, or if there's more than one like in
// sin(y*z) and therefore ambiguous, returns [null, null].
function guess_variable_in_expr(expr) {
  // SymPy expressions may already be tagged with the previously
  // used or guessed variable name.
  if(expr.is_sympy_expr() && expr.variable_name)
    return [expr.variable_name, variable_name_to_expr(variable_name)];
  const var_map = {};
  _guess_variable_in_expr(expr, var_map);
  const var_names = Object.getOwnPropertyNames(var_map);  // not ideal
  if(var_names.length === 1)
    return [var_names[0], var_map[var_names[0]]];
  // Always use x or t if it's there, even if there are other
  // potential variables present (unless x and t are both present).
  else if(var_map['x'] && !var_map['t'])
    return ['x', var_map['x']];
  else if(var_map['t'])
    return ['t', var_map['t']];
  else
    return [null, null];
}
function _guess_variable_in_expr(expr, var_map) {
  const variable_name = expr_to_variable_name(expr, true);
  if(variable_name &&
     !['e', 'pi', 'i'].includes(variable_name))
    var_map[variable_name] = expr;
  // We don't necessarily want to look for variables in every possible
  // subexpression; for example with x_a, the variable should be x_a as
  // a whole, even though it has the subexpressions 'x' and 'a'.
  let subexpressions = [];
  if(expr.is_function_call_expr())
    subexpressions.push(expr.args_expr);  // don't look at the function name itself
  else if(expr.is_subscriptsuperscript_expr()) {
    // Never recurse into subscripts, and if there is a subscript, don't
    // recurse into the base expression itself.  Always check superscripts though.
    if(expr.superscript_expr)
      subexpressions.push(expr.superscript_expr);
    if(!expr.subscript_expr)
      subexpressions.push(expr.base_expr);
  }
  else if(expr.is_infix_expr())
    subexpressions = expr.operand_exprs;  // don't look at the operators, only operands
  else if(expr.is_font_expr()) {
    // Don't look inside FontExprs; if it's \bold{x} we want 'bold_x',
    // not the 'x' inside.  This will miss variables inside other kinds
    // of bolded expressions, however.
  }
  else
    subexpressions = expr.subexpressions();
  for(const subexpr of subexpressions)
    _guess_variable_in_expr(subexpr, var_map);
}

