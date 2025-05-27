/**
 * Metalsmith Build Configuration
 *
 * This file configures how Metalsmith builds your site. Each section is documented
 * to help beginners understand what's happening at each step.
 *
 * WHAT IS METALSMITH?
 * Metalsmith is a static site generator that processes files through a series of plugins.
 * Think of it as an assembly line where each plugin transforms your content in some way:
 * 1. Start with source files (Markdown, HTML, etc.)
 * 2. Each plugin processes the files (convert Markdown to HTML, apply templates, etc.)
 * 3. Output the final static website
 *
 * HOW TO USE THIS FILE:
 * - Run `npm start` for development (includes file watching and live reload)
 * - Run `npm run build` for production (optimized output)
 * - Modify the plugin configurations below to customize your site
 */

// These are built-in Node.js modules needed for file paths and operations
import { fileURLToPath } from 'node:url'; // Converts file:// URLs to file paths
import { dirname } from 'node:path'; // Handles file paths across different OS
import * as fs from 'node:fs'; // File system operations (read/write files)

// The main Metalsmith library and plugins that transform your content
import Metalsmith from 'metalsmith'; // The core static site generator
import drafts from '@metalsmith/drafts'; // Excludes draft content from builds
import metadata from '@metalsmith/metadata'; // Adds metadata to all files
import collections from '@metalsmith/collections'; // Groups files into collections
import markdown from '@metalsmith/markdown'; // Converts Markdown to HTML
import permalinks from '@metalsmith/permalinks'; // Generates permalinks for files
import layouts from '@metalsmith/layouts'; // Applies templates to files
import prism from 'metalsmith-prism'; // Syntax highlighting for code blocks
import assets from 'metalsmith-static-files'; // Copies static assets to build

// Plugins that optimize and enhance the production build output
import htmlOptimizer from 'metalsmith-optimize-html'; // Minifies HTML in production
import sitemap from 'metalsmith-sitemap'; // Generates a sitemap.xml file

// Development server and performance measurement
import browserSync from 'browser-sync';
import { performance } from 'node:perf_hooks'; // Performance measurement

/**
 * ESM (ECMAScript Modules) doesn't support importing JSON directly
 * So we read the package.json file manually to get dependency information
 * @type {Object}
 */
const dependencies = JSON.parse( fs.readFileSync( './package.json' ) ).dependencies;

/**
 * Get the site metadata
 * @type {Object}
 */
const siteData = JSON.parse( fs.readFileSync( './lib/data/site.json' ) );

// These variables help determine the current directory and file paths
const thisFile = fileURLToPath( import.meta.url ); // Gets the actual file path of this script
const thisDirectory = dirname( thisFile ); // Gets the directory containing this script
const mainFile = process.argv[ 1 ]; // Gets the file that was executed by Node.js

// Import Nunjucks filters
import nunjucksFilters from './lib/nunjucks-filters.js';

/**
 * Configure the template engine (Nunjucks)
 * This defines how templates are processed and what options are available
 * @see https://mozilla.github.io/nunjucks/ for Nunjucks documentation
 */
const templateConfig = {
  directory: 'lib/layouts', // Where to find templates
  transform: 'nunjucks', // Template engine to use
  pattern: [ '**/*.html' ], // Files to apply templates to
  engineOptions: {
    smartypants: true, // Converts quotes, dashes, and ellipses to typographic equivalents
    smartLists: true, // Makes better list formatting
    filters: nunjucksFilters // Custom filters defined in lib/assets/nunjucks-filters.js
  }
};

/**
 * ENVIRONMENT SETUP
 * Determine if we're in production mode based on NODE_ENV environment variable
 * @type {boolean}
 */
const isProduction = process.env.NODE_ENV !== 'development';

// Variable to hold the development server instance
let devServer = null;

/**
 * Create a new Metalsmith instance
 * This is the core object that will build our site
 * @type {Metalsmith}
 */
const metalsmith = Metalsmith( thisDirectory );

/**
 * Configure the basic Metalsmith settings
 * These determine how Metalsmith will process our files
 * @see https://metalsmith.io/api/ for full API documentation
 */
metalsmith
  .clean( true )  // Delete build folder before each build
  .watch( isProduction ? false : [ 'src', 'lib/layouts', 'lib/assets' ] )  // Watch these folders for changes in development
  .env( 'NODE_ENV', process.env.NODE_ENV )  // Pass NODE_ENV to plugins
  .source( './src' )  // Directory containing source files (content)
  .destination( './build' )  // Directory where the built site will be output
  .metadata( {
    msVersion: dependencies.metalsmith, // Metalsmith version for footer
    nodeVersion: process.version  // Node.js version for footer
  } )

  /**
   * PLUGIN CHAIN - ORDER MATTERS!
   * The order of plugins is crucial because each plugin processes the files
   * and passes them to the next plugin. Think of it as an assembly line:
   *
   * 1. drafts()      - Remove draft files first (before processing)
   * 2. metadata()    - Add global data that other plugins might need
   * 3. collections() - Group files (needs to happen before templates)
   * 4. markdown()    - Convert .md to .html (before permalinks and templates)
   * 5. permalinks()  - Restructure URLs (before templates, so templates know final URLs)
   * 6. layouts()     - Apply templates (needs final content and URLs)
   * 7. prism()       - Add syntax highlighting (after HTML is generated)
   * 8. assets()      - Copy static files (can happen anytime)
   *
   * CHANGING PLUGIN ORDER:
   * Be careful when reordering plugins! Some depend on others having run first.
   * If something breaks, check if the plugin order makes sense.
   */

  /**
   * Filter out draft files in production
   * Draft files have 'draft: true' in their frontmatter
   * @see https://github.com/metalsmith/metalsmith-drafts
   */
  .use( drafts( !isProduction ) )

  /**
   * Add metadata to all files
   * This makes site-wide data available to all templates
   * @see https://github.com/metalsmith/metalsmith-metadata
   */
  .use(
    metadata( {
      site: 'lib/data/site.json',      // Global site settings (title, description, etc.)
      nav: 'lib/data/navigation.json'  // Navigation menu structure
    } )
  )

  /**
   * Group files into collections
   * This makes it easy to loop over related files in templates
   * Used in this case to list all blog posts on the blog page
   * @see https://github.com/metalsmith/metalsmith-collections
   */
  .use(
    collections( {
      blog: {
        pattern: 'blog/*.md',  // Only include markdownfiles in the 'blog' directory
        sortBy: 'date',  // Sort by the 'date' field in frontmatter
        reverse: true,  // Newest posts first (reverse chronological)
        limit: 20  // Only include the 20 most recent posts
      }
    } )
  )

  /**
   * Convert markdown to HTML
   * Processes all .md files and converts them to HTML
   * @see https://github.com/metalsmith/metalsmith-markdown
   */
  .use( markdown() )

  /**
   * Generate permalinks
   * Creates clean URLs by restructuring files (e.g., about.html → about/index.html)
   * @see https://github.com/metalsmith/permalinks
   */
  .use( permalinks() )

  /**
   * Apply templates
   * Wraps content in layout templates based on frontmatter
   * @see https://github.com/metalsmith/metalsmith-layouts
   */
  .use( layouts( templateConfig ) )

  /**
   * Syntax highlighting for code blocks
   * Adds syntax highlighting to code blocks in HTML
   * @see https://github.com/wernerglinka/metalsmith-prism
   */
  .use(
    prism( {
      lineNumbers: true,
      decode: true
    } )
  )

  /**
   * Copy static assets to the build directory
   * This includes images, CSS, and other files that don't change
   * @see https://github.com/wernerglinka/metalsmith-static-files
   */
  .use(
    assets( {
      source: 'lib/assets/',
      destination: 'assets/'
    } )
  );

/**
 * PRODUCTION OPTIMIZATIONS
 * These plugins only run in production mode to optimize the site
 */
if ( isProduction ) {
  metalsmith
    /**
     * Optimize HTML to reduce file size
     * Minifies HTML by removing whitespace, comments, etc.
     * @see https://github.com/wernerglinka/metalsmith-optimize-html
     */
    .use( htmlOptimizer() )

    /**
     * Generate a sitemap.xml file for search engines
     * Helps search engines discover and index your pages
     * @see https://github.com/ExtraHop/metalsmith-sitemap
     */
    .use(
      sitemap( {
        hostname: siteData.siteURL, // Your site's URL from site.json
        omitIndex: true, // Remove index.html from URLs
        omitExtension: true, // Remove .html extensions
        changefreq: 'weekly', // How often pages change
        lastmod: new Date(), // Last modification date
        pattern: [ '**/*.html', '!**/404.html' ], // Include all HTML except 404
        defaults: {
          priority: 0.5, // Default priority for pages
          changefreq: 'weekly', // Default change frequency
          lastmod: new Date() // Default last modified date
        }
      } )
    );
}

/**
 * BUILD EXECUTION
 * This section handles the actual build process and development server
 * It only runs when this file is executed directly (not when imported)
 */
if ( mainFile === thisFile ) {
  // Start timing the build for performance measurement
  let t1 = performance.now();

  // Execute the Metalsmith build
  metalsmith.build( ( err ) => {
    // Handle any build errors
    if ( err ) {
      throw err;
    }

    // Log build success and time taken
    /* eslint-disable no-console */
    console.log( `Build success in ${ ( performance.now() - t1 ).toFixed( 1 ) }ms` );

    // If watch mode is enabled, set up the development server
    if ( metalsmith.watch() ) {
      if ( devServer ) {
        // If server already exists, just reload it
        t1 = performance.now();
        devServer.reload();
      } else {
        // Otherwise, create a new BrowserSync server
        devServer = browserSync.create();
        devServer.init( {
          host: 'localhost', // Server hostname
          server: './build', // Directory to serve
          port: 3000, // Server port
          injectChanges: false, // Don't inject CSS changes, reload page
          reloadThrottle: 0 // Don't throttle reloads
        } );
      }
    }
  } );
}

// Export the Metalsmith instance for use in other files
export default metalsmith;
