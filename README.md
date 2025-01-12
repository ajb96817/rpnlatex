# rpnlatex - RPN style mathematical scratchpad

This is a browser-based editor meant for quickly entering and manipulating equations.
It can be used as a scratchpad for solving math problems, as an alternative to pen and
paper.  It has some limited document-preparation capabilities but for a full mathematical
word processor you should use something like LyX instead.

Equations are entered using a Reverse Polish Notation (RPN) input system inspired by
HP calculators.  Please see the built-in user manual, available by typing '?', for more information.

Note that this is not a web service, but a standalone webapp that is downloaded (cached) in your
browser and runs completely on your local hardware.  There is no server-side storage of documents, etc.

## Features

  * Cross-platform, with a simple and flexible interface suited for mobile or desktop.
  * Print-quality, instantaneous rendering of math formulas as you edit.
  * Operates entirely from the keyboard; no mouse actions or menu items to select.
  * Generates LaTeX-compatible code but does not require knowledge of LaTeX.
  * Almost everything normally found in mathematical books and papers can be quickly typeset with the built-in keybindings.
  * Build up formulas piece by piece in an intuitive way using a stack-based method.
  * Math formulas can be intermixed with normal text, with font styles, section headers, etc., and arranged into a document structure.
  * Documents can be kept in local browser storage, or saved to files.
  * Comprehensive user manual included.
  * Source code is easily modifiable if you want to add your own custom features.

## Quick start

A pre-built version is available here: https://ajb96817.github.io/rpnlatex

To run your own local copy, download the latest release package from Github and unpack it,
then open the 'index.html' file in a web browser.

To host this from a webserver, simply copy all files to a location on the server and
navigate to the URL in your browser.  No server-side dynamic features are needed on the
webserver; it's only static files.

If your browser supports Progressive Web Apps, you can use this as a PWA to get a little
more screen space.  For example:

  * iOS: Open the application in Safari.  Use the "send to" button and from there select "Add to Home Screen" to create a shortcut to use for PWA mode.
  * Android Chrome: From the three-dots menu, use "Add to Home Screen" to create a PWA mode shortcut.
  * Desktop Chrome: From the menu, select "Cast, save, and share" then "Create shortcut".  After that, there should be a new menu item "Open in rpnlatex" under "Cast, save, and share" to start it in PWA mode.

Desktop Firefox and Safari do not support PWA.

Note that you may need to host from a web server (as opposed to opening the local files
directly in your browser) in order to take advantage of PWA.

## Building from source

To build/run from source (not needed unless you want to change something):

  * Install npm (Node Package Manager)
  * Clone the source code repository: git clone https://github.com/ajb96817/rpnlatex
  * Run 'npm install'
  * Run 'npm start'
  * Open the displayed server URL in a web browser
  * To build a packaged release, run 'npm run build' and the release will be created in the build/ subdirectory


