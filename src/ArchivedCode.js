
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


// NOTE: SpecialFunctions is now handled by Algebrite, but keeping this around
// in case we stop using it.

// class SpecialFunctions {
//   static factorial(x) {
//     if(x >= 0 && this.is_integer(x)) {
//       if(x <= 1) return 1;
//       if(x > 20) return Infinity;
//       let value = 1;
//       for(let i = 2; i <= x; i++)
//         value *= i;
//       return value;
//     }
//     else
//       return this.gamma(x+1);
//   }

//   static gamma(x) {
//     const g = 7;
//     const C = [
//       0.99999999999980993, 676.5203681218851, -1259.1392167224028,
//       771.32342877765313, -176.61502916214059, 12.507343278686905,
//       -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
//     if(x <= 0)
//       return NaN;
//     if(x < 0.5)
//       return Math.PI / (Math.sin(Math.PI*x) * this.gamma(1-x));
//     x -= 1;
//     let y = C[0];
//     for(let i = 1; i < g+2; i++)
//       y += C[i] / (x + i);
//     const t = x + g + 0.5;
//     const result = Math.sqrt(2*Math.PI) * Math.pow(t, x+0.5) * Math.exp(-t) * y;
//     return isNaN(result) ? Infinity : result;
//   }

//   // Basic iterative evaluation of double factorial.
//   // 7!! = 7*5*3*1, 8!! = 8*6*4*2, 0!! = 1
//   // x must be a nonnegative integer and its magnitude is limited to something reasonable
//   // to avoid long loops or overflow.
//   static double_factorial(x) {
//     if(!this.is_integer(x) || x < 0) return NaN;
//     if(x > 100) return Infinity;
//     let result = 1;
//     while(x > 1) {
//       result *= x;
//       x -= 2;
//     }
//     return result;
//   }

//   static is_integer(x) {
//     return x === Math.floor(x);
//   }

//   static binom(n, k) {
//     // k must be a nonnegative integer, but n can be anything
//     if(!this.is_integer(k) || k < 0) return null;
//     if(k > 1000) return NaN;  // Limit loop length below
//     // Use falling factorial-based algorithm n_(k) / k!
//     let value = 1;
//     for(let i = 1; i <= k; i++)
//       value *= (n + 1 - i) / i;
//     if(this.is_integer(n)) {
//       // Resulting quotient is an integer mathematically if n is,
//       // but round it because of the limited floating point precision.
//       return Math.round(value);
//     }
//     else
//       return value;
//   }
// }

