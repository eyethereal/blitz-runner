var Table = require("cli-table");

var log = require("./logger");

var Context = require("./context");
var Zombie = require("./zombie");

module.exports = function(program) {

    // Create a single context
    var context = new Context();

    // Run each of the steps
    var finished = [];

    function runNextStep() {
        log.debug("runNextStep");
        var step = program.steps.shift();

        if (!step) return showResults();

        Zombie.run(context, step, function(err, result) {
            log.debugi("Zombie callback ",err, result);
            if (err) {
                showResults(err);
                return;
            }

            step.result = result;
            finished.push(step);
            process.nextTick(runNextStep);
        });
    }

    runNextStep();

    function timing(timing) {
        if (!timing.end) {
            if (timing.error) {
                timing.end = timing.error;
            } else {
                console.log("unknown");
                return;
            }
        }

        return (timing.end - timing.created);
    }

    function printSent(step) {
        if (!step.result.sent) return console.log();

        for(var ix=0; ix<step.result.sent.length; ix++) {
            var str = step.result.sent[ix].toString();
            process.stdout.write(str.blue);
        }
        process.stdout.write("\n");        
    }

    function printResponse(step) {
        for(var ix=0; ix<step.result.data.length; ix++) {
            var str = step.result.data[ix].toString();
            process.stdout.write(str.green);
        }
        process.stdout.write("\n");        
    }

    function showResults(err) {
        log.debug("showResults");

        if (err) {
            console.error("Got error: ", err);
        }

        if (program.response || program.sent) {
            for(var snum=0; snum < finished.length; snum++) {
                step = finished[snum];

                console.log("  #%s %s %s  ".inverse, snum, step.request || "GET", step.url);

                if (program.sent) {
                    printSent(step);
                }

                if (program.response) {
                    printResponse(step);
                }
                console.log();
            }
        }



        var table = new Table({
            head: ['Step', 'Code', 'Time(ms)', 'Bytes', 'URL'] 
            , colWidth: [ 4, 4, 7, 9, 40]
            , colAligns: ['middle', 'middle', 'right', 'right', 'left']
        });

        for(var snum=0; snum < finished.length; snum++) {
            step = finished[snum];

            // Count the bytes of response
            var bytes = 0;
            for(var ix=0; ix<step.result.data.length; ix++) {
                bytes += step.result.data[ix].length;
            }

            var row = [snum];

            var c = step.result.statusCode;
            if (c==200) {
                row.push((""+c).green);
            } else if (c>300 && c<400) {
                row.push((""+c).blue);
            } else {
                row.push((""+c).red);
            }


            row.push(timing(step.result.timing));
            row.push(bytes);
            row.push(step.url);

            table.push(row);
        }

        console.log(table.toString());
        //     console.log("Step #%d\t%d %s\t %d bytes    %s",snum++, step.result.statusCode, timing(step.result.timing), bytes, step.url);

        //     // Some conditional response output
        //     if (step.result.statusCode == 301 || step.result.statusCode == 302) {
        //         var location = step.result.headers["location"];
        //         if (location) {
        //             console.log("  Location:",location);
        //         } else {
        //             console.log("  No location header present");
        //         }
        //         if (program.response) printResponse(step);
        //     } else if (step.result.statusCode < 200 || step.result.statusCode > 299) {
        //         printResponse(step);
        //     } else if (program.response) {
        //         printResponse(step);
        //     }


        //     //timing(step.result.timing);
        //     console.log();

        //     step = finished.shift();
        // }
    }
}