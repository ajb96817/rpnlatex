# rpnlatex - RPN style mathematical scratchpad

  * **Current release version**: `1.3.2` - ([live build](https://ajb96817.github.io/rpnlatex/)) - ([alternative site](https://andrewbrault.com/rpnlatex/))
  * **Development version**: `1.4.0` - ([live build](https://andrewbrault.com/rpnlatex_dev/)) - ([source code](https://github.com/ajb96817/rpnlatex))

This is a browser-based editor meant for quickly entering and manipulating equations.
It can be used as a scratchpad for solving math problems, as an alternative to pen and
paper.  It has some limited document-preparation capabilities but for a full mathematical
word processor you should use something like LyX instead.

Equations are entered using a Reverse Polish Notation (RPN) input system inspired by
HP calculators.  Please see the built-in user manual, available by typing '?', for more information.

Note that this is not a web service, but a standalone webapp that is downloaded (cached) in your
browser and runs completely on your local hardware.  There is no server-side storage of documents, etc.

## Features

  * Open source and cross-platform, with a simple and flexible interface suited for mobile or desktop.
  * Print-quality, instantaneous rendering of math formulas as you edit.
  * Operates entirely from the keyboard; no mouse actions or menu items to select.
  * Generates LaTeX-compatible code but does not require knowledge of LaTeX.
  * Almost everything normally found in mathematical books and papers can be quickly typeset with the built-in keybindings.
  * Build up formulas piece by piece in an intuitive way using a stack-based method.
  * Symbolic algebra and calculus operations and numerical facilities are provided.
  * Math formulas can be intermixed with normal text, with font styles, section headers, etc., and arranged into a document structure.
  * Documents can be kept in local browser storage, or saved to files.
  * Comprehensive user manual included.
  * Source code is easily modifiable if you want to add your own custom features.

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


