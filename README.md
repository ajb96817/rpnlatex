# rpnlatex - RPN style LaTeX editor and scratchpad

  * **Current release version**: `1.5.0` - ([live build](https://ajb96817.github.io/rpnlatex/)) - ([alternative site](https://andrewbrault.com/rpnlatex/))
  * **Development version**: `1.5.1` - ([live build](https://andrewbrault.com/rpnlatex_dev/)) - ([source code](https://github.com/ajb96817/rpnlatex))

This is a browser-based math editor meant for quickly entering and manipulating
formulas using a Reverse Polish Notation (RPN) input system inspired by HP calculators.
Math formulas are rendered symbolically as you edit as print-quality LaTeX.  This editor
works as an efficient alternative to pen and paper for solving math problems interactively,
and can also create structured documents with mixed text and math.

This editor is open source and cross-platform with a simple and flexible interface suited
for both mobile and desktop.  It operates entirely from the keyboard; no mouse actions or
menu items to select.  It generates LaTeX-compatible code but does not require knowledge
of LaTeX.  Almost everything normally found in mathematical books and papers can be quickly
typeset using its stack-based input system.

Additionally, symbolic algebra and calculus operations are available within the editor
to help with interactively solving problems or exercises.  The powerful
[SymPy](https://www.sympy.org/) symbolic mathematics package is available and
operates directly on formulas you enter to simplify expressions, solve integrals,
derivatives, and more.  [Pyodide](https://pyodide.org/) is used to run a full Python
environment locally in your browser (via WebAssembly) to power the SymPy package.

This editor can be efficient and convenient, but there is a learning curve,
and it takes practice to learn the keyboard commands and how to best work with
the stack-based input system.  There is a comprehensive built-in user manual,
available by typing '?' upon startup.

Note that this is not a web service, but a standalone webapp that is downloaded
(cached) in your browser and runs completely on your local hardware.
There is no server-side storage of documents, etc.

The [source code](https://github.com/ajb96817) is freely available and easily
modifiable if you want to add your own custom features.

## Quick start

A pre-built version is available here: https://ajb96817.github.io/rpnlatex

To run your own local copy, first download the latest release package from Github and unpack it.
Due to browser security restrictions, you will need to set up a local webserver to serve the
application files (it won't work using file:// URLs).  No server-side dynamic features are needed
on the webserver; it's only static files.

A simple option, if you have Python installed, is to use the `http.server` Python module.
From the directory you unpacked into, run `python3 -m http.server`.  It will display a local
URL you can use.

Once you have the files available on a webserver, simply open `index.html` from your web browser.

An alternative to a standalone webserver is to use `npm start` as described below in the "Building from source" section.
This runs a built-in webserver (via [Vite](https://vite.dev/)) to serve up the application, and
also lets you edit the source code if you want to make any changes or customizations.

## Progressive Web App support

If your browser supports Progressive Web Apps, you can use this as a PWA to get a little
more screen space.

  * iOS: Open the application in Safari.  Use the "send to" button and from there select "Add to Home Screen" to create a shortcut to use for PWA mode.
  * Android Chrome: From the three-dots menu, use "Add to Home Screen" to create a PWA mode shortcut.
  * Desktop Chrome: From the menu, select "Cast, save, and share" then "Create shortcut".  After that, there should be a new menu item "Open in rpnlatex" under "Cast, save, and share" to start it in PWA mode.
  * Desktop Safari: Click the "Share" icon in the browser toolbar, then "Add to Dock", then launch the app from the dock.
  * Desktop Firefox: PWA is not supported.

## Building from source

To build/run from source (not needed unless you want to change something):

  * Install `npm` (Node Package Manager)
  * Clone the source code repository: `git clone https://github.com/ajb96817/rpnlatex`
  * Run `npm install`
  * Run `npm start`
  * Open the displayed server URL in a web browser
  * To build a packaged release, run `npm run build` and the release will be created in the `build/` subdirectory


