'use strict';


(function(window) {
  function createElement(ns, name, props) {
    var el = ns ? document.createElementNS(ns, name) : document.createElement(name);

    for (var key in props) {
      if (key === "style") {
        for (var styleName in props.style) {
          el.style[styleName] = props.style[styleName];
        }
      } else {
        el[key] = props[key];
      }
    }

    return el;
  }

  function getTidFromThread(thread) {
    // XXX tid is missing in parser.js. Extract tid from thread name.
    var tid = thread.name.match(/:(\d+)\)/g);
    if (tid) {
      tid = tid[0].slice(1, tid[0].length - 1);
      tid = parseInt(tid);
    }
    return tid;
  }

  function TimelineRendering() {
    this.tasks = [];
    this.renderAttributes = {
      // height
    };
  }

  TimelineRendering.prototype.addTask = function(task) {
    this.tasks.push(task);
  };

  function TaskRendering(taskModel, isRoot) {
    this.taskModel = taskModel;
    this.taskView = null;
    // Attributes that will be realized in this.taskView (a SGV element).
    this.renderAttributes = {
      // color
      // x, y, width, height
      // and other attributes
    };
  }

  function TasktracerView() {
    this.threadTimelineElements = new Map(); // tid->timeline element
    this.threadHistogramViews = new Map();
  }

  TasktracerView.prototype = {

    getHistogramView: function(tid) {
      return this.threadHistogramViews.get(tid);
    },

    setTaskInfo: function(task) {
      this.setTaskInfoElement("taskId", task.id);
      this.setTaskInfoElement("sourceEventType", task.sourceEventType);
      this.setTaskInfoElement("sourceEventId", task.sourceEventId);
      this.setTaskInfoElement("start", task.begin);
      this.setTaskInfoElement("latency", task.latency);
      this.setTaskInfoElement("executionTime", task.executionTime);
      this.setTaskInfoElement("parentTaskId", task.parentTaskId);
    },

    clearTaskInfo: function() {
      this.setTaskInfoElement("taskId", "");
      this.setTaskInfoElement("sourceEventType", "");
      this.setTaskInfoElement("sourceEventId", "");
      this.setTaskInfoElement("start", "");
      this.setTaskInfoElement("latency", "");
      this.setTaskInfoElement("executionTime", "");
      this.setTaskInfoElement("parentTaskId", "");
    },

    setTaskInfoElement: function(className, value) {
      var tab = document.getElementById("ttTaskInfoTab");
      if (!tab) {
        return;
      }
      var element = tab.getElementsByClassName(className);
      if (!element || element.length == 0) {
        return;
      }
      element[0].innerHTML = String(value);
    },

    renderTaskInfoTab: function() {
      if (!document.getElementById("ttTaskInfoTab")) {
        var taskInfoTab = createElement(null, "div", {
          className: "tab",
          id: "ttTaskInfoTab",
          style: {
            display: "flex",
            background: "white",
            width: "100%",
            height: "100%"
          }
        });
        var innerHTML = `
        <div style="width: 250px; height: 100% overflow: scroll; border-right: 1px solid #CCC; margin-left: 10px; margin-right: 10px">
          <h2>Show relevant tasks</h2>
          <div><input type="checkbox" id="showBacktrackTasks">Track backwards</div>
          <div><input type="checkbox" id="showFowardtrackTasks">Track forwards</div>
          <h2>Blocking tasks</h2>
          <div><input type="checkbox" id="showBlockingTasks">Show blocking tasks of the selected task</div>
        </div>
        <div style="flex: 1">
          <div><span class="labelItem">Name</span><h4 class="name"></h4></div>
          <div><span class="labelItem">TaskID</span><span class="taskId"></span></div>
          <div><span class="labelItem">SourceEventType</span><span class="sourceEventType"></span></div>
          <div><span class="labelItem">SourceEventID</span><span class="sourceEventId"></span></div>
          <div><span class="labelItem">Begin</span><span class="begin"></span></div>
          <div><span class="labelItem">Latency</span><span class="latency"></span></div>
          <div><span class="labelItem">Execution time</span><span class="executionTime"></span></div>
          <div><span class="labelItem">Task ID of parent task</span><span class="parentTaskId"></span></div>
        </div>
        `;

        taskInfoTab.innerHTML = innerHTML;
        gTabWidget.addTab("Tasks", taskInfoTab);
        window.addEventListener("change", this.handleTaskInfoTabChange.bind(this));
      }
    },

//    getTTDivElement: function(histogramView) {
//      var histogramChildren = histogramView.container.parentNode.childNodes;
//      var i = 0;
//      for (; i < histogramChildren.length; i++) {
//        if (histogramChildren[i].className === "ttTimelineContent") {
//          return histogramChildren[i];
//        }
//      }
//      return null;
//    },

    clearRenderedTasks: function() {
      var i = 0;
      var ttTimelines = gHistogramContainer.container.getElementsByClassName("ttTimelineContent");
      for (; i < ttTimelines.length; i++) {
        ttTimelines[i].innerHTML = "";
      }
    },

    renderTask: function(taskRendering, svgElement) {
      var task = taskRendering.taskModel;
      var renderAttributes = taskRendering.renderAttributes;
      if (!renderAttributes) {
        return;
      }

      var taskExecution = createElement("http://www.w3.org/2000/svg", "rect", {
        style: {
          fill: renderAttributes.taskColor,
          strokeWidth: "1",
          stroke: renderAttributes.strokeColor
        }
      });
      taskExecution.setAttribute("width", "" + renderAttributes.taskWidth);
      taskExecution.setAttribute("height", "10");
      taskExecution.setAttribute("y", renderAttributes.taskYPos + "px");
      taskExecution.setAttribute("x", renderAttributes.taskXPos + "px");
      svgElement.appendChild(taskExecution);

      var taskDelay = createElement("http://www.w3.org/2000/svg", "rect", {
        style: {
          fill: renderAttributes.delayColor,
          strokeWidth: "1",
          stroke: renderAttributes.strokeColor
        }
      });
      taskDelay.setAttribute("width", "" + renderAttributes.delayWidth);
      taskDelay.setAttribute("height", "6");
      taskDelay.setAttribute("y", renderAttributes.delayYPos + "px");
      taskDelay.setAttribute("x", renderAttributes.delayXPos + "px");
      svgElement.appendChild(taskDelay);
    },

    renderTasks: function(renderedTasks, rootTask) {
      var self = this;
      renderedTasks.forEach(function(tr, tid, map) {
        var histogramView = self.threadHistogramViews.get(tid);
        if (!histogramView) {
          return;
        }

        var divElement = self.threadTimelineElements.get(tid);
        if (!divElement) {
          return;
        }

        var svgElement = createElement("http://www.w3.org/2000/svg", "svg", {
          style: {
            backgroundColor: "rgb(224, 255, 224)"
          }
        });
        svgElement.setAttribute("width", "" + histogramView.container.getBoundingClientRect().width);
        svgElement.setAttribute("height", tr.renderAttributes.height);
        divElement.appendChild(svgElement);

        // tr: a TimelineRendering instance.
        tr.tasks.forEach(function(element, index, array) {
          self.renderTask(element, svgElement);
        });
      });

      this.setTaskInfo(rootTask);
    },

    handleTaskInfoTabChange: function(ev) {
      switch(ev.target.id) {
      case "showBacktrackTasks":
        PROFILERLOG(`backtrackLevel: ${ev.target.checked}`);
        break;
      case "showForwardtrackTasks":
        PROFILERLOG(`forwardtrackLevel: ${ev.target.checked}`);
        break;
      case "showBlockingTasks":
        PROFILERLOG(`showBlockingTasks: ${ev.target.checked}`);
        break;
      default:
        break;
      }
    },

    installTTTimelineContent: function(thread) {
      var histogramContainer = thread.threadHistogramView.container.parentNode;
      var children = histogramContainer.children;
      var i = 0;
      for (; i < children.length;) {
        if (children[i].className === "ttTimelineContent") {
          histogramContainer.removeChild(children[i]);
        } else {
          i++;
        }
      }

      var ttTimelineContainer = createElement(null, "div", {
        className: "ttTimelineContent",
        border: "0",
        borderCollapse: "collapse",
        cellPadding: "0",
        cellSpacing: "0",
        style: {
          width: "100%",
        }
      });
      histogramContainer.appendChild(ttTimelineContainer);

      var tid = getTidFromThread(thread);
      if (tid > 0) {
        this.threadTimelineElements.set(tid, ttTimelineContainer);
        this.threadHistogramViews.set(tid, thread.threadHistogramView);
      }
    },

    getCheckboxUserInput: function(id) {
      var val = document.getElementById(id);
      if (!val) {
        return false;
      }

      return val.checked;
    },

    showBacktrackTasks: function() {
      return this.getCheckboxUserInput("showBacktrackTasks");
    },

    showForwardtrackTasks: function() {
      return this.getCheckboxUserInput("showBacktrackTasks");
    },

  };

  function Tasktracer() {
    this.tasksById = new Map();
    this.tasksByTid = new Map();
    this.laskClickedTask = null;
    this.tasktracerView = new TasktracerView();
  }

  Tasktracer.prototype = {
    getTaskByTidTime: function(tid, time) {
      var tasks = this.tasksByTid.get(tid);
      var left = 0;
      var right = tasks.length - 1;

      // Perform a binary search to find the task so that time is in
      // [task.begin, task.end]. Tasks are sorted by task.begin.
      while (left < right - 1) {
        var middle = (left + right) / 2 | 0;
        var task = tasks[middle];
        if (task.begin <= time && task.end >= time) {
          return task;
        }

        if (tasks[middle].begin <= time) {
          left = middle;
        } else {
          right = middle
        }
      }

      if (tasks[right].begin <= time && tasks[right.end] >= time) {
        return tasks[right];
      }

      return null;
    },

    getRenderedTasks: function(rootTask) {
      // A map of tid -> [TimelineRendering]
      var renderedTasks = new Map();

      function addToRenderedTasks(task, level) {
        var taskRendering = new TaskRendering(task);
        var timelineRendering = renderedTasks.get(task.threadId);
        if (!timelineRendering) {
          timelineRendering = new TimelineRendering();
          renderedTasks.set(task.threadId, timelineRendering);
        }
        timelineRendering.addTask(taskRendering);

        // Initialize renderAttributes
        var renderAttributes = {};

        taskRendering.renderAttributes = renderAttributes;

        var hue = 120; // Origin is green
        // Assign color attributes.
        if (level < 0) {
          hue = 100 + level % 5 * 20;
        } else if (level > 0) {
          hue = 140 + level % 11 * 20;
        }

        renderAttributes.taskColor = "hsl(" + hue + ", 60%, 70%)";
        renderAttributes.delayColor = "hsl(" + hue + ", 40%, 90%)";
        renderAttributes.strokeColor = "hsl(" + hue + ", 80%, 40%)";
      }

      // root task
      addToRenderedTasks(rootTask, 0);

      var i = undefined;
      // Backtrack
      if (this.tasktracerView.showBacktrackTasks()) {
        var currentTask = rootTask.parentTask;
        for (i = 0;
             currentTask;
             i++, currentTask = currentTask.parentTask) {
          addToRenderedTasks(currentTask, - (i + 1));
        }
        PROFILERLOG("Backtrack " + i + " task(s)");
      }

      if (this.tasktracerView.showForwardtrackTasks()) {
        var numTasks = 0;
        // Forwardtrack. It's a tree that we need to do breadth-first traversal.
        var currentTasks = rootTask.childTasks;
        for (i = 0; currentTasks && currentTasks.length > 0; i++) {
          var nextLevelTasks = [];
          numTasks += currentTasks.length;
          currentTasks.forEach(function(element, index, array) {
            addToRenderedTasks(element, i + 1);
            if (element.childTasks) {
              nextLevelTasks = nextLevelTasks.concat(element.childTasks);
            }
          });
          currentTasks = nextLevelTasks;
        }
        PROFILERLOG("Forwardtrack " + numTasks + " task(s)");
      }

      // Sort each array.
      renderedTasks.forEach(function(tr, tid, map) {
        tr.tasks.sort(function(a, b) { // a and b are TaskRendering instances.
          return a.taskModel.dispatch - b.taskModel.dispatch;
        });
      });

      var self = this;
      // Then we are ready to layout the tasks.
      renderedTasks.forEach(function(tr, tid, map) {
        var taskPlacement = [0];

        var histogramView = self.tasktracerView.getHistogramView(tid);
        if (!histogramView) {
          return;
        }

        tr.tasks.forEach(function(element, index, array) {
          var renderAttributes = element.renderAttributes;
          var task = element.taskModel;

          renderAttributes.taskWidth = histogramView.timeToPixel(task.end) -
                                       histogramView.timeToPixel(task.begin);
          renderAttributes.taskHeight = 10;
          renderAttributes.taskXPos = histogramView.timeToPixel(task.begin);

          renderAttributes.delayWidth = histogramView.timeToPixel(task.begin) -
                                        histogramView.timeToPixel(task.dispatch);
          renderAttributes.delayHeight = 6;
          renderAttributes.delayXPos = histogramView.timeToPixel(task.dispatch);

          // Decide Y positions
          for (var i = 0; i < taskPlacement.length; i++) {
            if (taskPlacement[i] < renderAttributes.delayXPos) {
              // [delayX, taskX + taskWidth] are occupied.
              taskPlacement[i] = renderAttributes.taskXPos +
                                 renderAttributes.taskWidth;
              renderAttributes.taskYPos = 11 * i;
              break;
            }
          }
          if (renderAttributes.taskYPos === undefined) {
            renderAttributes.taskYPos = 11 * taskPlacement.length;
            taskPlacement.push(renderAttributes.taskXPos +
                               renderAttributes.taskWidth);
          }
          renderAttributes.delayYPos = renderAttributes.taskYPos + 2;
        });

        tr.renderAttributes.height = taskPlacement.length * 11;
      });

      return renderedTasks;
    },

    histogramClicked: function(ev) {
      PROFILERLOG("Histogram Clicked.");
      var histogramView = ev.detail.histogramView;
      var thread = window.gThreadsDesc[histogramView.threadId];
      PROFILERLOG("thread: " + thread);
      var tid = getTidFromThread(thread);
      PROFILERLOG("tid " + tid + "is selected");

      var time = ev.detail.sample.time;
      var task = this.getTaskByTidTime(tid, time);

      if (task === this.laskClickedTask) {
        // No need to update.
        return;
      }
      this.laskClickedTask = task;

      this.tasktracerView.clearRenderedTasks();
      if (!task) {
        return;
      }

      var renderedTasks = this.getRenderedTasks(task);

      this.tasktracerView.renderTasks(renderedTasks, task);
    },

    onProfileLoaded: function() {
      PROFILERLOG("TT profile loaded.");

      this.tasktracerView.renderTaskInfoTab();

      // Install a <div> element for each thread to display TT elements.
      gHistogramContainer.eachThread(
        this.tasktracerView.installTTTimelineContent.bind(
          this.tasktracerView));

      // Compute delta of start times between TT and SPS.
      var delta = window.gTasktracer.startTime - window.gMeta.startTime;
      var self = this;

      window.gTasktracer.tasks.forEach(function(task, index, array) {
        if (task.id === 0) {
          // XXX Hack to remove invalid data. Fix from the source!!!
          return;
        }
        // Time adjustments.
        task.begin += delta;
        task.dispatch += delta;
        task.end += delta;

        // build index for the tasks
        var tid = task.threadId;
        self.tasksById.set(task.id, task);
        if (!self.tasksByTid.get(tid)) {
          self.tasksByTid.set(tid, []);
        }
        self.tasksByTid.get(tid).push(task);
      });

      this.tasksByTid.forEach(function(tasks, tid){
        tasks.sort(function(a, b){
          return a.dispatch - b.dispatch;
        });
      });

      // Build task relationships
      this.tasksById.forEach(function(task, id) {
        var parent = self.tasksById.get(task.parentTaskId);
        if (parent) {
          task.parentTask = parent;
          if (!parent.childTasks) {
            parent.childTasks = [];
          }
          parent.childTasks.push(task);
        }
      });

      gHistogramContainer.container.
        addEventListener("HistogramClick", this.histogramClicked.bind(this));
    },

    loadRawProfile: function(rawProfile) {
      PROFILERLOG("Parse raw TT profile: ~" + rawProfile.length + " bytes");
//      reporter.begin("Parsing...");
      if (rawProfile == null || rawProfile.length === 0) {
//        reporter.begin("Profile is null or empty");
        return;
      }
      var startTime = Date.now();
      if (typeof rawProfile == "string" && rawProfile[0] == "{") {
        // rawProfile is a JSON string.
        window.gTasktracer = JSON.parse(rawProfile);
        if (!window.gTasktracer) {
          throw new Error("rawProfile couldn't not successfully be parsed using JSON.parse. Make sure that the profile is a valid JSON encoding.");
        }
      }

      this.onProfileLoaded();
    }

  };

  window.gTasktracer = new Tasktracer();
}(this));
