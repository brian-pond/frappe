const fs     = require('fs');
const path   = require('path');
const chalk  = require('chalk');
const rollup = require('rollup');

const {
	get_build_json,
	get_app_path,
	apps_list,
	run_serially,
	assets_path,
	sites_path,
	get_build_json_path
} = require('./rollup.utils');

const {
	get_options_for
} = require('./config');

function build_assets_for_all_apps() {
	run_serially(
		apps_list.map(app => () => build_assets_for_app(app))
	);
}

function build_assets_for_app(app) {
	// options is an Object containing input and output configuration and generation options.
	const options = get_options_for(app);
	if (!options.length) return Promise.resolve();
	console.log(chalk.yellow(`\nPerforming rollup & bundle for app='${app}' JS & CSS assets...\n`));

	const promises = options.map(({ inputOptions, outputOptions, output_file}) => {
		return rollup_and_bundle(inputOptions, outputOptions)
			.then(() => {
				console.log(`${chalk.green('✔')} Built ${output_file}`);
			});
	});

	const start = Date.now();
	return Promise.all(promises)
		.then(() => {
			const time = Date.now() - start;
			console.log(chalk.green(`✨  Done in ${time / 1000}s`));
		});
}

async function rollup_and_bundle(inputOptions, outputOptions) {
	// Rollup is a 3rd party NPM package.  
	try {
		const bundle = await rollup.rollup(inputOptions);
		return bundle.write(outputOptions);
	}
	catch (err) {
		console.log(chalk.red(err));
		// Kill process to fail in a CI environment
		if (process.env.CI) {
			process.kill(process.pid);
		}
	}
}

function concatenate_files() {
	/* 
		Scope: This function is hard-coded for the Frappe App --only--.
		Purpose: Combine multiple *.js files together, to reduce number of HTTP calls.
		Pseudocode:
		1. In each APP's 'public' folder, there can be a file named 'build.json'
		2. Some of this JSON may contain keys beginning with letters "concat", like this:

	 		"concat:js/moment-bundle.min.js": [
				"node_modules/moment/min/moment-with-locales.min.js",
				"node_modules/moment-timezone/builds/moment-timezone-with-data.min.js"
			],
		
		3. This function concatenates the child files, into a larger file with the parent node's name.
		4. Results are stored in each SITE's asset folders:
			../mybench/sites/assets/js/<concatenated_file_name>
	*/
	console.log(chalk.yellow(`\nConcatenating app='frappe' JS assets...\n`));

	// From build.json, get the "concat" object
	const obj_build_concat = get_build_json('frappe')['concat']

	Object.entries(obj_build_concat).map(([output_file, input_files]) => {
		const file_content = input_files.map(file_name => {
			let prefix = get_app_path('frappe');
			if (file_name.startsWith('node_modules/')) {
				prefix = path.resolve(get_app_path('frappe'), '..');
			}
			const full_path = path.resolve(prefix, file_name);
			return `/* ${file_name} */\n` + fs.readFileSync(full_path);
		}).join('\n\n');

		const output_file_path = output_file.slice('concat:'.length);
		const build_json_path = get_build_json_path('frappe')
		const target_path = path.resolve(assets_path, output_file_path);
		fs.writeFileSync(target_path, file_content);
		console.log(`${chalk.green('✔')} Built ${output_file_path} using concatenation rules in '${build_json_path}.'`);
	});
}

function ensure_js_css_dirs() {
	const paths = [
		path.resolve(assets_path, 'js'),
		path.resolve(assets_path, 'css')
	];
	paths.forEach(path => {
		if (!fs.existsSync(path)) {
			fs.mkdirSync(path);
		}
	});
}

function show_production_message() {
	const production = process.env.FRAPPE_ENV === 'production';
	console.log(chalk.green(`Running in ${production ? 'Production' : 'Development'} mode.`));
}

// Main Execution:
show_production_message();
ensure_js_css_dirs();
concatenate_files();

// Create a .build file
const touch = require('touch');
touch(path.join(sites_path, '.build'), { force: true });

const build_for_app = process.argv[2] === '--app' ? process.argv[3] : null;
if (build_for_app) {
	build_assets_for_app(build_for_app)
} else {
	build_assets_for_all_apps();
}
