# React + Vite Chrome Extension Template

This is a template for creating a Chrome extension using React and [Vite](https://vitejs.dev/) with TypeScript.


## Getting Started

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/) (version 18+ or 20+) installed on your machine.

### Setup

1. Clone or fork the repository :

    ```sh
    # To clone
    git clone https://github.com/isrark005/react-vite-chrome-extention-boilerplate.git
    cd react-vite-chrome-extention-boilerplate
    ```

2. Install the dependencies:

    ```sh
    npm install
    ```

## Development

To start the development server:

```sh
npm run dev
```

This will start the Vite development server and open your default browser.

## Build 

To create a production build:

```sh
npm run build
```

## Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable "Developer mode" using the toggle switch in the top right corner.
3. Click "Load unpacked" and select the `build` directory.

Your React app should now be loaded as a Chrome extension!

## Extra Information
- You can keep all the additional files like background.js into public directory 

## Credit
This template was initially made by [5tigerjelly](https://github.com/5tigerjelly/chrome-extension-react-template).

