var util = require("util");

var Table = require("cli-table");
// var multimeter = require("multimeter");
var ProgressBar = require("progress");

var log = require("./logger");

var Context = require("./context");
var Zombie = require("./zombie");

module.exports = function(program, intervals) {

    var ints = [];

    // load up that ints array with parsed interval definitions
    var re = /(\d+)-(\d+):(\d+)/;
    var iList = intervals.split(",");

    var cursorTime = 0; // in seconds
    for(var listIx = 0; listIx < iList.length; listIx++) {
        var iStr = iList[listIx];

        var m = re.exec(iStr);

        if (!m) {
            console.error("Did not understand interval ", iStr);
            process.exit(1);
        }

        var int = {
            countStart: parseInt(m[1])
            , countDelta: parseInt(m[2]) - parseInt(m[1])
            , startTime: cursorTime * 1000
            , endTime: (cursorTime + parseInt(m[3])) * 1000
        }
        ints.push(int);

        cursorTime += parseInt(m[3]);
    }

    var maxTime = cursorTime;

    log.warningi("parsed intervals ", ints);


    /////////////////////////////////////////////////////////

    var startedAt = 0;  // ms
    var currentTime = 0;  // ms from startedAt

    function interpolateMax() {

        while (ints[0] && currentTime > ints[0].endTime) ints.shift();
        if (!ints[0]) return 0; // Actuall signals that we are done honestly


        var timeD = currentTime - ints[0].startTime;
        var timeP = timeD / (ints[0].endTime - ints[0].startTime);

        var val = timeP * ints[0].countDelta;
        var max = Math.floor(val) + ints[0].countStart;

        log.debugi("interpolatedMax at ",currentTime," is ", max);
        return max;
    }

    /////////////////////////////////////////////////////////
    var steps = program.steps;

    for(var ix=0; ix<steps.length; ix++) {
        steps[ix].id = ix;
    }

    function copyStep(step) {
        var out = {};

        for(var key in step) {
            out[key] = step[key];
        }

        return out;
    }

    function copySteps() {
        var out = [];
        for(var ix=0; ix<steps.length; ix++) {
            out.push( copyStep(steps[ix]) );
        }
        return out;
    }

    /////////////////////////////////////////////////////////

    var numWorkers = 0;
    var stopAll = false;

    var stepResponses = {};

    var running = {};

    function udid(a,b){for(b=a='';a++<36;b+=a*51&52?(a^15?8^Math.random()*(a^20?16:4):4).toString(16):'-');return b};

    function addWorker() {

        log.debug("addWorker");

        var worker = {
            id: udid()
            
            , context: new Context()
            , steps: copySteps()

            , run: function(callback) {

                log.info("step worker ", this.id);

                running[this.id] = this;

                var next = this.steps.shift();

                if (!next) {
                    log.infoi("completed worker ",this.id);
                    this.result = 'success';
                    delete running[this.id];
                    callback();
                    return;
                }

                if (this.canceled || stopAll) {
                    this.result = 'timeout';
                    delete running[this.id];
                    callback();
                    return;
                }


                var toRun = this.run.bind(this, callback);

                var zombieKiller = Zombie.run(this.context, next, (function(err, result) {
                    log.debugi("step finish worker ",this.id, " ", result);
                    if (err) {
                        this.result = 'error';
                        this.error = err;
                        delete running[this.id];
                        callback(err);
                        return;
                    }

                    var list = stepResponses[next.id];
                    if (!list) {
                        list = [];
                        stepResponses[next.id] = list;
                    }

                    var e = result.timing.end || result.timing.error;
                    var time = e - result.timing.created;

                    var summary = {
                        code: result.statusCode
                        , time: time
                    };

                    log.infoi("summary ", summary);

                    list.push(summary);

                    process.nextTick(toRun);
                }).bind(this));

                this.cancel = function() {
                    log.debugi("Canceling worker ", this.id);
                    zombieKiller();
                    //delete running[this.id];
                }

            }
        }

        numWorkers++;
        worker.run(function(err) {
            numWorkers--;

            if (!stopAll) {
                process.nextTick(checkForMoreWorkers);
            } else {
                checkFinalEnd();
            }
        });
    }


    function checkForMoreWorkers() {
        currentTime = Date.now() - startedAt;

        var maxWorkers = interpolateMax();
        if (maxWorkers == 0) {
            handleEnding();
            return;
        }

        log.debugi("checkForMoreWorkers max=",maxWorkers," num=",numWorkers);

        // Spawn until we hit our max
        while (numWorkers < maxWorkers) addWorker();
    }

    // var bar = null;
    if (log.logLevel == log.ERROR) {
        var bar = new ProgressBar('Running [:bar] :percent :etas remaining', { total: maxTime * 1000, width: 20 });
        var lastBarTime = 0;
    }

    function updateProgressBar() {
        if (!bar) return;

        var barDelta = currentTime - lastBarTime;
        bar.tick(barDelta);
        lastBarTime = currentTime;
    }



    function periodic() {
        //log.error("periodic");
        process.stdout.write(".");
        checkForMoreWorkers();
        updateProgressBar();
        if (!stopAll) setTimeout(periodic, 1000);
    }


    function handleEnding() {
        log.info("handleEnding");
        stopAll = true;

        for (var key in running) {
            var worker = running[key];
            if (worker.cancel) worker.cancel();
        }

        checkFinalEnd();
    }

    function checkFinalEnd() {
        var haveWorkers = false;
        for (var key in running) {
            haveWorkers = true;
            break;
        }

        if (haveWorkers) return;

        log.info("final end no more workers");
        // No more workers, just results!!!!

        function getTimeStats(list) {

            if (!list) return {
                codeCounts: {}
                , min: 99999999
                , max: -1
                , avg: 0
            };

            var min = 9999999999;
            var max = 0;

            var totalTime = 0;
            var totalWorkers = 0;

            var codeCounts = {};

            for(var ix=0; ix<list.length; ix++) {
                var item = list[ix];

                min = Math.min(min, item.time);
                max = Math.max(max, item.time);

                totalTime += item.time;
                totalWorkers++;

                if (!codeCounts[item.code]) {
                    codeCounts[item.code] = 0;
                }
                codeCounts[item.code]++;
            }

            return {
                codeCounts: codeCounts
                , min: min
                , max: max
                , avg: Math.floor(totalTime / totalWorkers)
            }
        }

        var table = new Table({
            head: ['Step', 'Min(ms)', 'Max(ms)', 'Avg(ms)', 'Status Codes']
            , colWidth: [ 4, 8, 8, 10]
            , colAligns: ['middle', 'right', 'right', 'right', 'left']
        });

        for(var ix in steps) {
            var step = steps[ix];

            var list = stepResponses[step.id];
            var stats = getTimeStats(list);

            var row = [];
            row.push(step.id);
            row.push(stats.min );
            row.push(stats.max );
            row.push(stats.avg );

            row.push(util.inspect(stats.codeCounts));

            log.warningi(row);
            table.push(row);
        }

        console.log();
        console.log(table.toString());
    }


    // And go!
    startedAt = Date.now();
    periodic();
}