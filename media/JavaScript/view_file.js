// Authors: Joe Redmon and Ophir Lifshitz
// view_file.js

/* This is where the fun begins, now we have a Tab panel where you can see both the actual data
displayed in an GridPanel, and the chart of the data, rendered with flot */

Ext.onReady(function() {
    Ext.state.Manager.setProvider(new Ext.state.CookieProvider());
    var conn = new Ext.data.Connection();
    var store = new Ext.data.ArrayStore();
    var fieldData = [];
    var gridColumns = [];
    var storeFields = [];
    var dataArray = [];
    
    // Initialize grid for file view
    var grid = new Ext.grid.GridPanel({
        store:          store,
        columns:        gridColumns,
        stripeRows:     true,
        height:         300,
        autoWidth:      true,
        title:          'File Data',
        horizontalScroll: true,
    });

    /* ComboBoxes allow user to specify X and Y cooordinates for the graph, they are populated with field data when the file is initially loaded and do not get updated if the file is changed, since it is unlikely that new parameters will be added, even in live data. */
    var xChoice = new Ext.form.ComboBox({
        fieldLabel:     'X Axis',
        hiddenName:     'xchoice',
        store:          fieldData,
        typeAhead:      true,
        mode:           'local',
        triggerAction:  'all',
        emptyText:      'Select X axis...',
        selectOnFocus:  true,
        listeners:      {select: {fn: selection}},
        
        id:             'xTitle',
        listClass:      'xChoiceList', /* Apply class to dropdown menu list */
    });
    var yChoice = new Ext.form.ComboBox({
        fieldLabel:     'Y Axis',
        hiddenName:     'ychoice',
        store:          fieldData,
        typeAhead:      true,
        mode:           'local',
        triggerAction:  'all',
        emptyText:      'Select Y axis...',
        selectOnFocus:  true,
        listeners:      {select: {fn: selection}},
        
        id:             'yTitle',
        listClass:      'yChoiceList', /* Apply class to dropdown menu list */
    });

    // Comboboxes have their own containers to apply unique styles (i.e., alignment relative to plot)
    var xChoiceContainer = new Ext.Container({
     // width:          500,
        id:             'xChoiceContainer',
        cls:            'ChoiceContainer',
        items:          [xChoice],
    });
    var yChoiceContainer = new Ext.Container({
     // height:         500,
        id:             'yChoiceContainer',
        cls:            'ChoiceContainer',
        items:          [yChoice],
    });
    
    /* Holds the flot plot */
    var ChartContainer = new Ext.Panel({
     // height:         500,
     // width:          500,
        
        id:             'ChartContainer',
    });
    
    /* Holds the chart container and the combo boxes */
    var ChartTab = new Ext.Panel({
        title:          'Chart',
        autoWidth:      true,
        autoHeight:     true,
        
        id:             'ChartTab',
        items:          [yChoiceContainer, ChartContainer, xChoiceContainer], // Originally [xChoice, yChoice, ChartContainer], but this order is better
    });

    /* Create and initialize tabs */
    var tabs = new Ext.TabPanel({
       renderTo:        'tabs',
       activeTab:       0, // CHANGE BACK TO 0
       defaults:        {autoHeight: true, autoWidth: true},
       layoutOnTabChange: true,
    });
    tabs.add({
        id:             'file',
        title:          'View File',
        items:          [grid],
    }).show();
    tabs.add({
        listeners:      {activate: activateChart},
        id:             'chart',
        title:          'View Chart',
        items:          [ChartTab],
    }).show();


    /* Draws the chart when the user activates the chart tab. If no choice is specified for the graph, it defaults to A4 and Detector */
    function activateChart(tab) {
        if (xChoice.getValue() == '' || yChoice.getValue == '') {
            xChoice.setValue('A4');
            yChoice.setValue('Detector');
        }
        drawChart(store, xChoice.getValue(), yChoice.getValue(), 'ChartContainer');
    }

    /* When the user selects a new parameter from the comboboxes, the chart is redrawn with that choice in mind */
    function selection(selectedstore, value) {
        drawChart(store, xChoice.getValue(), yChoice.getValue(), 'ChartContainer');
    }


    tabs.render();
    var first = true;



    /* Retrieve data in json format via a GET request to the server. This is used anytime there is new data, and initially to populate the table. */
    function update() {
        conn.request({
            url: 'json/' + idNum,
            method: 'GET',
            params: {},
            success: function(responseObject) {
                jsonpoints = Ext.decode(responseObject.responseText);
                dataArray = jsonpoints;
                reloadData();
            },
            failure: function() {
                alert('Failed Request');
            }
        });
    }

    /* Same idea as in all_files.js, when new data comes, we must re-initialize our store to update the plot */
    function reloadData() {
        fieldData = dataArray[0];
        if (first) {
            xChoice.store = fieldData;
            yChoice.store = fieldData;
        }
        first = false;
        dataArray.splice(0, 1);
        gridColumns = [];
        storeFields = [];
        for (var i = 0; i < fieldData.length; ++ i) {
            gridColumns.push({header: fieldData[i], width: 70, sortable: true, dataIndex: fieldData[i]});
            storeFields.push({name: fieldData[i]});
        }

        store = new Ext.data.ArrayStore({
            fields: storeFields,
        });

        store.loadData(dataArray);
        colModel = new Ext.grid.ColumnModel({columns: gridColumns});
        grid.reconfigure(store, colModel);

        if (tabs.getActiveTab().getId() == 'chart') {
            activateChart(tabs.getActiveTab());
        }
    }
    var jsonpoints = {};

    /* Set up the stomp client, subscribe to channel of individual file ID so that we only receive update information about our specific file. */
    stomp = new STOMPClient();
    stomp.onopen = function() {};
    stomp.onclose = function(c) {
        alert('Lost Connection, Code: ' + c);
    };
    stomp.onerror = function(error) {
        alert("Error: " + error);
    };
    stomp.onerrorframe = function(frame) {
        alert("Error: " + frame.body);
    };
    stomp.onconnectedframe = function() {
        stomp.subscribe("/updates/files/"+ idNum);
    };
    stomp.onmessageframe = function(frame) {
        //alert('OMG we got updates!!!!1!!!111');
        update();
    };
    stomp.connect('localhost', 61613);
    update();
});

/* Initialize Flot generation, draw the chart with error bars */
function drawChart(store, xChoice, yChoice, chart) {
    var chartInfo = getData(store, xChoice, yChoice);


    var chartContainer = $('#' + chart);

    var datapoints = {
      errorbars: 'y',
      yerr: { show: true, upperCap: '-', lowerCap: '-' },
    };
    
    var options = {
      series: { points: { show: true, radius: 3 } },
      selection: { mode: 'xy' },
      zoom: { // plugin
        interactive: true,
        //recenter: false,
        //selection: 'xy',
        //trigger: null,
        amount: 1.5,
      },
      pan: { // plugin
        interactive: false
      },
      grid: {hoverable: true, clickable: true},
      //yaxis: {autoscaleMargin: null},
    };


    var plot = $.plot(
      chartContainer,
      [{
        label:    xChoice + ' vs. ' + yChoice + ': Series 1',
        data:     chartInfo,
        points:   datapoints,
        lines:    {show: false}
      }],
      options); //.addRose(); // Compass rose for panning
    
}

/* Gets data from the Store to draw the chart */
function getData(store, xcol, ycol) {
    var dataResults = [];

    for (var recordIndex = 0; recordIndex < store.getCount(); recordIndex++ ) {
        var record = store.getAt(recordIndex);
        var data = [record.get(xcol), record.get(ycol), Math.sqrt(record.get(ycol))]; // Calculate error bars with square roots; not included in data file as it should be
        dataResults.push(data);
    }
    return dataResults;
}

