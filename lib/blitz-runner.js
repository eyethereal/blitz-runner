var sprint = require("./sprint");
var rush = require("./rush");
var log = require("./logger");

process.on("uncaughtException", function(err) {
    console.error("Uncaught");
    console.error(err);
});


var program = require('commander');

program
    .version('0.0.1')
    .option('-f, --file [steps.json]', 'A json file containing an array of steps')
    .option('-b, --base [url fragment]', 'A base URL to prepend to all urls in the step file')
    .option('-r, --response', 'Show body of all responses')
    .option('-s, --sent', 'Show body of all requests')
    .option('-v, --verbose', 'Enable verbose debug output');


program
    .command("sprint")
    .description("run a single sprint of the steps")
    .action(function() {
        commonOptions();
        sprint(program);
    });


program
    .command("rush <intervals>")
    .description("run a rush with the given intervals spec")
    .action(function(intervals) {
        commonOptions();
        rush(program,intervals);
    });


sprint.program = program;
rush.program = program;

program.parse(process.argv);

if (!program.didThing) {
    program.help();
}

///////////////

function commonOptions() {
    program.didThing = true;

    if (program.verbose) {
        log.logLevel = log.DEBUG;
    } else {
        log.logLevel = log.ERROR;
    }

    if (!program.file) {
        console.error("A steps file must be specified");
        process.exit(1);
    }

    var path = program.file;
    program.steps = require(path);

    if (!program.steps) {
        console.error("Failed to load steps file");
        process.exit(1);
    }

    if (program.base) {
        for(var ix=0; ix<program.steps.length; ix++) {
            var step = program.steps[ix];
            step.fullURL = program.base + step.url;
            log.debugi("Updated step to ", step.fullURL);
        }
    }
}