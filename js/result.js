/*global rg2:false */
(function () {
  function Result(data, isScoreEvent, scorecodes, scorex, scorey) {
    // resultid is the kartat id value
    this.resultid = data.resultid;
    this.rawid = this.resultid % rg2.config.GPS_RESULT_OFFSET;
    this.isScoreEvent = isScoreEvent;
    this.name = rg2.he.decode(data.name);
    this.initials = this.getInitials(this.name);
    this.starttime = data.starttime;
    this.time = data.time;
    this.position = data.position;
    this.status = data.status;
    // get round iconv problem in API for now: unescape special characters to get sensible text
    this.comments = rg2.he.decode(data.comments);
    this.coursename = data.coursename;
    if (this.coursename === "") {
      this.coursename = data.courseid;
    }
    this.courseid = data.courseid;
    this.splits = data.splits;
    // insert a 0 split at the start to make life much easier elsewhere
    this.splits.splice(0, 0, 0);
    if (data.variant !== "") {
      // save control locations for score course result
      this.scorex = scorex;
      this.scorey = scorey;
      this.scorecodes = scorecodes;
    }
    this.initialiseTrack(data);
  }


  Result.prototype = {
    Constructor : Result,

    initialiseTrack : function (data) {
      var info;
      this.cumulativeDistance = [];
      this.legpos = [];
      // set true if track includes all expected controls in correct order or is a GPS track
      this.hasValidTrack = false;
      this.displayTrack = false;
      this.displayScoreCourse = false;
      this.trackColour = rg2.colours.getNextColour();
      // raw track data
      this.trackx = [];
      this.tracky = [];
      this.speedColour = [];
      // interpolated times
      this.xysecs = [];
      // GPS track ids are normal resultid + GPS_RESULT_OFFSET
      if (this.resultid >= rg2.config.GPS_RESULT_OFFSET) {
        this.isGPSTrack = true;
        // don't get time or splits so need to copy them in from original result
        info = rg2.results.getTimeAndSplitsForID(this.rawid);
        this.time = info.time;
        this.splits = info.splits;
        // allow for events with no results where there won't be a non-GPS result
        if (this.time === rg2.config.TIME_NOT_FOUND) {
          this.time = data.time;
        }
      } else {
        //this.name = data.name;
        this.isGPSTrack = false;
      }
      if (data.gpsx !== "") {
        this.addTrack(data);
      }
    },

    putTrackOnDisplay : function () {
      if (this.hasValidTrack) {
        this.displayTrack = true;
      }
    },

    removeTrackFromDisplay : function () {
      if (this.hasValidTrack) {
        this.displayTrack = false;
      }
    },

    addTrack : function (data, format) {
      var trackOK;
      this.trackx = data.gpsx.split(",").map(function (n) {
        return parseInt(n, 10);
      });
      this.tracky = data.gpsy.split(",").map(function (n) {
        return parseInt(n, 10);
      });
      if (this.isGPSTrack) {
        trackOK = this.expandGPSTrack();
      } else {
        if (format === rg2.config.EVENT_WITHOUT_RESULTS) {
          trackOK = this.expandTrackWithNoSplits();
        } else {
          trackOK = this.expandNormalTrack();
        }
      }
      if (trackOK) {
        rg2.courses.incrementTracksCount(this.courseid);
      }
    },

    drawTrack : function (opt) {
      var i, l, oldx, oldy, stopCount;
      if (this.displayTrack) {
        rg2.ctx.lineWidth = opt.routeWidth;
        rg2.ctx.strokeStyle = this.trackColour;
        rg2.ctx.globalAlpha = rg2.options.routeIntensity;
        rg2.ctx.fillStyle = this.trackColour;
        rg2.ctx.font = '10pt Arial';
        rg2.ctx.textAlign = "left";
        rg2.ctx.beginPath();
        rg2.ctx.moveTo(this.trackx[0], this.tracky[0]);
        oldx = this.trackx[0];
        oldy = this.tracky[0];
        stopCount = 0;
        l = this.trackx.length;
        for (i = 1; i < l; i += 1) {
          // lines
          rg2.ctx.lineTo(this.trackx[i], this.tracky[i]);
          if ((this.trackx[i] === oldx) && (this.tracky[i] === oldy)) {
            // we haven't moved
            stopCount += 1;
          } else {
            // we have started moving again
            if (stopCount > 0) {
              if (!this.isGPSTrack || (this.isGPSTrack && opt.showThreeSeconds)) {
                rg2.ctx.fillText("+" + (3 * stopCount), oldx + 5, oldy + 5);
              }
              stopCount = 0;
            }
          }
          oldx = this.trackx[i];
          oldy = this.tracky[i];
          if (this.isGPSTrack && opt.showGPSSpeed) {
            rg2.ctx.strokeStyle = this.speedColour[i];
            rg2.ctx.stroke();
            rg2.ctx.beginPath();
            rg2.ctx.moveTo(oldx, oldy);
          }
        }
        rg2.ctx.stroke();
      }
    },

    drawScoreCourse : function () {
      // draws a score course for an individual runner to show where they went
      // based on drawCourse in course.js
      // could refactor in future...
      // > 1 since we need at least a start and finish to draw something
      var angle, i, opt;
      if ((this.displayScoreCourse) && (this.scorex.length > 1)) {
        opt = rg2.getOverprintDetails();
        rg2.ctx.globalAlpha = rg2.config.FULL_INTENSITY;
        angle = rg2.utils.getAngle(this.scorex[0], this.scorey[0], this.scorex[1], this.scorey[1]);
        rg2.controls.drawStart(this.scorex[0], this.scorey[0], "", angle, opt);
        angle = [];
        for (i = 0; i < (this.scorex.length - 1); i += 1) {
          angle[i] = rg2.utils.getAngle(this.scorex[i], this.scorey[i], this.scorex[i + 1], this.scorey[i + 1]);
        }
        rg2.courses.drawLinesBetweenControls({x: this.scorex, y: this.scorey}, angle, this.courseid, opt);
        for (i = 1; i < (this.scorex.length - 1); i += 1) {
          rg2.controls.drawSingleControl(this.scorex[i], this.scorey[i], i, Math.PI * 0.25, opt);
        }
        rg2.controls.drawFinish(this.scorex[this.scorex.length - 1], this.scorey[this.scorey.length - 1], "", opt);
      }
    },

    expandNormalTrack : function () {
      var course;
      // allow for getting two tracks for same result: should have been filtered in API...
      this.xysecs.length = 0;
      this.cumulativeDistance.length = 0;
      // add times and distances at each position
      this.xysecs[0] = 0;
      this.cumulativeDistance[0] = 0;
      // get course details
      course = {};
      // each person has their own defined score course
      if (this.isScoreEvent) {
        course.x = this.scorex;
        course.y = this.scorey;
      } else {
        course.x = rg2.courses.getCourseDetails(this.courseid).x;
        course.y = rg2.courses.getCourseDetails(this.courseid).y;
      }
      this.calculateTrackTimes(course);
      // treat all score tracks as valid for now
      // may need a complete rethink on score course handling later
      if (this.isScoreEvent) {
        this.hasValidTrack = true;
      }
      return this.hasValidTrack;
    },

    calculateTrackTimes: function (course) {
      var nextcontrol, nextx, nexty, dist, oldx, oldy, i, x, y, previouscontrolindex;
      nextcontrol = 1;
      nextx = course.x[nextcontrol];
      nexty = course.y[nextcontrol];
      dist = 0;
      oldx = this.trackx[0];
      oldy = this.tracky[0];
      x = 0;
      y = 0;
      previouscontrolindex = 0;
      // read through list of controls and copy in split times
      // we are assuming the track starts at the start which is index 0...
      // look at each track point and see if it matches the next control location
      for (i = 1; i < this.trackx.length; i += 1) {
        // calculate distance while we are looping through
        x = this.trackx[i];
        y = this.tracky[i];
        dist += rg2.utils.getDistanceBetweenPoints(x, y, oldx, oldy);
        this.cumulativeDistance[i] = Math.round(dist);
        oldx = x;
        oldy = y;
        // track ends at control
        if ((nextx === x) && (nexty === y)) {
          this.xysecs[i] = this.splits[nextcontrol];
          this.addInterpolatedTimes(previouscontrolindex, i);
          previouscontrolindex = i;
          nextcontrol += 1;
          if (nextcontrol === course.x.length) {
            // we have found all the controls
            this.hasValidTrack = true;
            break;
          }
          nextx = course.x[nextcontrol];
          nexty = course.y[nextcontrol];
        }
      }
    },

    expandTrackWithNoSplits : function () {
      // based on ExpandNormalTrack, but deals with event format 2: no results
      // this means we have a course and a finish time but no split times
      var totaltime, currenttime, course, nextcontrol, nextx, nexty, lastx, lasty, i, x, y, moved, previouscontrolindex, dist, totaldist, oldx, oldy;
      this.xysecs.length = 0;
      this.cumulativeDistance.length = 0;

      // only have finish time, which is in [1] at present
      totaltime = this.splits[1];
      currenttime = 0;
      this.xysecs[0] = 0;
      this.cumulativeDistance[0] = 0;

      // get course details: can't be a score course since they aren't supported for format 2
      course = {};
      course.x = rg2.courses.getCourseDetails(this.courseid).x;
      course.y = rg2.courses.getCourseDetails(this.courseid).y;
      nextcontrol = 1;
      nextx = course.x[nextcontrol];
      nexty = course.y[nextcontrol];
      lastx = course.x[course.x.length - 1];
      lasty = course.y[course.y.length - 1];
      // add finish location to track just in case...
      this.trackx.push(lastx);
      this.tracky.push(lasty);
      dist = 0;
      previouscontrolindex = 0;
      totaldist = this.calculateTotalTrackLength();
      // read through track to generate splits
      x = 0;
      y = 0;
      moved = false;
      oldx = this.trackx[0];
      oldy = this.tracky[0];
      for (i = 1; i < this.trackx.length; i += 1) {
        x = this.trackx[i];
        y = this.tracky[i];
        // cope with routes that have start and finish in same place, and where the first point in a route is a repeat of the start
        if ((x !== this.trackx[0]) || (y !== this.tracky[0])) {
          moved = true;
        }
        dist += rg2.utils.getDistanceBetweenPoints(x, y, oldx, oldy);
        this.cumulativeDistance[i] = Math.round(dist);
        oldx = x;
        oldy = y;
        // track ends at control, as long as we have moved away from the start
        if ((nextx === x) && (nexty === y) && moved) {
          currenttime = parseInt((dist / totaldist) * totaltime, 10);
          this.xysecs[i] = currenttime;
          this.splits[nextcontrol] = currenttime;
          this.addInterpolatedTimes(previouscontrolindex, i);
          previouscontrolindex = i;
          nextcontrol += 1;
          if (nextcontrol === course.x.length) {
            // we have found all the controls
            this.hasValidTrack = true;
            break;
          }
          nextx = course.x[nextcontrol];
          nexty = course.y[nextcontrol];
        }
      }
      return this.hasValidTrack;
    },

    calculateTotalTrackLength : function () {
      // read through track to find total distance
      var i, oldx, oldy, totaldist;
      totaldist = 0;
      oldx = this.trackx[0];
      oldy = this.tracky[0];
      for (i = 1; i < this.trackx.length; i += 1) {
        totaldist += rg2.utils.getDistanceBetweenPoints(this.trackx[i], this.tracky[i], oldx, oldy);
        oldx = this.trackx[i];
        oldy = this.tracky[i];
      }
      return totaldist;
    },

    addInterpolatedTimes : function (startindex, endindex) {
      // add interpolated time at each point based on cumulative distance; this assumes uniform speed...
      var oldt, deltat, olddist, deltadist, i;
      oldt = this.xysecs[startindex];
      deltat = this.xysecs[endindex] - oldt;
      olddist = this.cumulativeDistance[startindex];
      deltadist = this.cumulativeDistance[endindex] - olddist;
      for (i = startindex; i <= endindex; i += 1) {
        this.xysecs[i] = oldt + Math.round(((this.cumulativeDistance[i] - olddist) * deltat / deltadist));
      }
    },

    expandGPSTrack : function () {
      var t, dist, oldx, oldy, x, y, delta, maxSpeed, oldDelta, sum, POWER_FACTOR, l;
      dist = 0;
      oldx = this.trackx[0];
      oldy = this.tracky[0];
      x = 0;
      y = 0;
      maxSpeed = 0;
      oldDelta = 0;
      POWER_FACTOR = 1;
      l = this.trackx.length;
      // in theory we get one point every three seconds
      for (t = 0; t < l; t += 1) {
        this.xysecs[t] = 3 * t;
        x = this.trackx[t];
        y = this.tracky[t];
        delta = rg2.utils.getDistanceBetweenPoints(x, y, oldx, oldy);
        dist += delta;
        sum = delta + oldDelta;
        if (maxSpeed < sum) {
          maxSpeed = sum;
        }
        this.speedColour[t] = Math.pow(sum, POWER_FACTOR);
        this.cumulativeDistance[t] = Math.round(dist);
        oldx = x;
        oldy = y;
        oldDelta = delta;
      }
      this.setSpeedColours(Math.pow(maxSpeed, POWER_FACTOR));
      this.hasValidTrack = true;
      return this.hasValidTrack;

    },

    setSpeedColours : function (maxspeed) {
      var i, red, green, halfmax;
      //console.log("'Max speed = " + maxspeed);
      halfmax = maxspeed / 2;
      // speedColour comes in with speeds at each point and gets updated to the associated colour
      for (i = 1; i < this.speedColour.length; i += 1) {
        if (this.speedColour[i] > halfmax) {
          // fade green to orange
          red = Math.round(255 * (this.speedColour[i] - halfmax) / halfmax);
          green = 255;
        } else {
          // fade orange to red
          green = Math.round(255 * this.speedColour[i] / halfmax);
          red = 255;
        }
        this.speedColour[i] = '#';
        if (red < 16) {
          this.speedColour[i] += '0';
        }
        this.speedColour[i] += red.toString(16);
        if (green < 16) {
          this.speedColour[i] += '0';
        }
        this.speedColour[i] += green.toString(16) + '00';
      }
    },

    getInitials : function (name) {
      var i, addNext, len, initials;
      // converts name to initials
      if (name === null) {
        return "??";
      }
      name.trim();
      len = name.length;
      initials = "";
      addNext = true;
      for (i = 0; i < len; i += 1) {
        if (addNext) {
          initials += name.substr(i, 1);
          addNext = false;
        }
        if (name.charAt(i) === " ") {
          addNext = true;
        }
      }
      return initials;
    }
  };
  rg2.Result = Result;
}());
