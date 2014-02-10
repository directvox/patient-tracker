app.factory
(
	'vitalsModel',
	[
	 	 'model','constants',
		 function(model,constants)
		 {
			 var selectedDay = new Date();	//initially "today"
			 
			 return {
				 definitions:null,			//
				 definitionsIndexed:null,
				 definitionOptions:null,
				 form:{},
				 charts: {},
				 records:[],
				 status: null,
				 selectedVitalId: undefined,
				 selectedDay: selectedDay.getFullYear() + '-' + (selectedDay.getMonth() + 1 < 10 ? '0' : '') + (selectedDay.getMonth() + 1) + '-' + (selectedDay.getDate() < 10 ? '0' : '') + selectedDay.getDate(),
				 statements: [],
				 unregisterListener:{},
				 _vitals: null,
				 _vitalsCache: {}
			};
		 }
	]
);

app.controller
(
	'VitalsCtrl',
	['$scope', '$rootScope', 'model', 'userModel', 'vitalsModel', 'vitalsService', 'conditionsService', 'navigation','constants','fhir-factory',
	function($scope, $rootScope, model, userModel, vitalsModel, vitalsService, conditionsService, navigation, constants, adapter)
	{
		//	dependencies
		$scope.applicationModel = model;
		$scope.userModel = userModel;
		$scope.vitalsModel = vitalsModel;
		$scope.vitalsService = vitalsService;
		$scope.navigation = navigation;
		
		$scope.status = null;
		
		$scope.vitalsModel.unregisterListener['destroy'] = $rootScope.$on
		(
			"destroy",
			function()
			{
				vitalsModel.unregisterListener['deleteStatement']();
				vitalsModel.unregisterListener['destroy']();
			}
		);
		
		vitalsModel.unregisterListener['deleteStatement'] = $rootScope.$on
		(
			"deleteStatement",
			function(e,statement)
			{
				if( vitalsModel.statements.indexOf(statement)>-1 )
					$scope.deleteStatement(statement);
			}
		);
		
		$scope.$watch
		(
			'vitalsModel.selectedVitalId',
			function(newVal,oldVal)
			{
				if( newVal != oldVal )
				{
					for(var t in vitalsModel.definitions)
					{
						if(vitalsModel.definitions[t].id==newVal)
						{
							vitalsModel.selectedVital = vitalsModel.definitions[t];
							
							$scope.safeApply();
						}
					}
				}
			}
		);
		
		var syncStatements  = function()
		{
			for(var s in vitalsModel.statements)
			{
				var records = vitalsService.getRecordsForTracker(vitalsModel.statements[s]);
				var definition = vitalsModel.definitionsIndexed[ vitalsModel.statements[s].code ];
				
				var values = new Array();
				var valuesFlat = new Array();
				
				var valuesIndexed = [];
				
				angular.forEach
				(
					records,
					function(r)
					{
						for(var i=0;i<Math.min( definition.valueLabelDepth, r.values.length);i++)
						{
							if( !valuesFlat[i] ) 
								valuesIndexed[i] = r.values[i].values;
							else
								valuesIndexed[i] = valuesIndexed[i].concat( r.values[i].values );
						}
						
						var vals = r.values.map(function(a){ return a.values[0]; } );
						var unit = r.values.map(function(a){ return a.unit; } );
						
						valuesFlat = values.concat( vals );
						values.push( {values:vals,unit:unit[0]} );
					}
				);
				
				var lastLabelValues = [];
				var lastLabelUnits = null;
				
				for( var i=0;i<Math.min(definition.valueLabelDepth,values.length);i++)
				{
					lastLabelValues.push( values[i].values[0] );
					lastLabelUnits = values[i].unit;
				}
				
				var v = {min: _.min( valuesFlat ), max: _.max( valuesFlat ), values: valuesIndexed, lastRecord: records.length ? records[0] : null, lastValue: {value:lastLabelValues.join("/"),unit:lastLabelUnits} };
				
				vitalsModel.statements[s].values = v;
			}
			
			$scope.safeApply();
		};
		
		$scope.$watch
		(
			'vitalsModel.records',
			function(newVal,oldVal)
			{
				if( newVal != oldVal )
					syncStatements();
			},true
		);
		
		$scope.$watch
		(
			'vitalsModel.statements',
			function(newVal,oldVal)
			{
				if( newVal != oldVal )
					syncStatements();
			},true
		);
		
		$scope.addStatement = function()
		{
			$scope.setStatus();
 			
			if( !$scope.vitalsModel.selectedVital )
			{
				$scope.setStatus("Please select a vital");
			}
			
			if( !$scope.status )
			{
				var data = 
				{
					name: vitalsModel.selectedVital.label,
					code: vitalsModel.selectedVital.code,
					codeName: vitalsModel.selectedVital.codeName,
					codeURI: vitalsModel.selectedVital.codeURI
				};
			}
			
			if( $scope.status )
				return;
			
			var code = data.code;
			
			return vitalsService.addStatement
 			(
 				data,
 				function(data, status, headers, config)
				{
 					navigation.showPopup();						//hide popup
 					model.tabs['trackers'].active=true;			//this automatically selects the "My Trackers" tab
 					
 					// 	add newly-added tracker to condition statement
 					if( model.selectedCondition )
 					{
 						model.selectedCondition.trackers.push( code );
 						
 	 					conditionsService.updateStatement( model.selectedCondition );
 					}
 					
 					vitalsService.getStatements();
 					
 					if( constants.DEBUG ) 
 						console.log( "addStatement", data );
 					
 					$scope.safeApply();
				},
				
				function( data, status, headers, config ) 
				{
					if( status == 500 )
						$scope.setStatus( "Ooops, it looks like this vital has already been added!" );
					
					if( constants.DEBUG ) 
						console.log( "addStatement error", data, typeof data );
				}
 			);
		};
		
		$scope.deleteStatement = function(statement)
		{
			var data = {id:statement.id};
			
			return vitalsService.deleteStatement
 			(
 				data,
 				function( data, status, headers, config )
				{
 					navigation.showPopup();
 					
 					vitalsService.getStatements();
 					
 					if( constants.DEBUG ) 
 						console.log( "deleteStatement", data );
 					
 					$scope.safeApply();
				},
				
				function ( data, status, headers, config ) 
				{
					if( constants.DEBUG ) 
						console.log( "deleteStatement error", data );
				}
 			);
		};
		
		$scope.update = function()
		{
			vitalsService.update();
		};
		
		$scope.addRecord = function()
		{
			$scope.setStatus();
			
			var date = vitalsModel.form.add.date;
			var time = vitalsModel.form.add.time;
			
			if( !date ) $scope.showStatus("Please specify a date");
			
			date = new Date( date + ' ' + time ).toISOString();
			
			var vital = model.selectedTracker.definition;
			var components = [];
			
			if( !$scope.status )
			{
				for(var c in vitalsModel.form.add.components)
				{
					var component = vitalsModel.form.add.components[c];
					
					var label = component.label ? component.label : vital.label;
					var value = component.value;
					
					if( (component.type == "range" || component.type == "number") && isNaN(value) )
						$scope.setStatus( label + " must be a number" );
					
					components.push( component );
				}
			}
			
			if( components.length != vitalsModel.form.add.components.length )
			{
				$scope.setStatus("Misc error");
				return;
			}
			
			console.log('addRecord',vital,vitalsModel.form.add);
			
			if( $scope.status )
				return;
			
			var observation = adapter.getTracker( vital, components, vitalsModel.form.add.comments, model.patient.id, date );
			
			console.log( observation );
			
			if( !observation )
			{
				$scope.setStatus("Misc error");
				return;
			}
			
			vitalsService.addRecord
			(
				observation,
				function(data, status, headers, config)
	 			{
	 				vitalsService.getRecords();
	 				
	 				$rootScope.$emit("trackerAdded");
	 				
	 				if( constants.DEBUG ) console.log( "success" );
	 			},
	 			function(data, status, headers, config)
	 			{
	 				$scope.setStatus( data.error );
	 			}
			);
		};
		
		$scope.getVitalUnit = function( type )
		{
			for(var i=0;i<vitalsModel.vitalDefinitions.length;i++)
				if( vitalsModel.vitalDefinitions[i].type == type )
					return vitalsModel.vitalDefinitions[i].unit;
			
			return null;
		};
		
		$scope.getVital = function( type )
		{
			if( !type ) 
				return vitalsModel.vitals;
			
			if( vitalsModel._vitalsCache[type] != undefined ) 
				return vitalsModel._vitalsCache[type];
			
			var inputType = type;
			
			if( type == constants.VITAL_TYPE_BLOOD_PRESSURE ) 
				type = constants.VITAL_TYPE_BLOOD_PRESSURE_SYSTOLIC;
			
			var vitals = [];
			
			for(var i=0;i<vitalsModel.vitals.length;i++)
				if( vitalsModel.vitals[i].type == type )
					vitals.push( vitalsModel.vitals[i] );
			
			if( inputType == constants.VITAL_TYPE_BLOOD_PRESSURE ) 
			{
				var vitals2 = $scope.getVitals( constants.VITAL_TYPE_BLOOD_PRESSURE_DIASTOLIC );
				
				for(var i=0;i<vitals2.length;i++)
					for(var j=0;j<vitals.length;j++)
						if( vitals[j].date == vitals2[i].date )
							vitals[j].value2 = vitals2[i].value;
			}
			
			//	sort by date
			vitals.sort(function(a,b){return a.date-b.date;});
			
			vitalsModel.vitalsCache[type] = vitals;
			
			return vitals;
		};
		
		$scope.showTracker = function(trackerId)
		{
			vitalsModel.displayedTrackerId = trackerId;
			
			$scope.safeApply();
		};
		
		$scope.setStatus = function(status)
		{
			status = typeof status != 'undefined' ? status : null;
			
			$scope.status = status;
		};
		
		$scope.safeApply = function()
		{
			var phase = this.$root.$$phase;
			if( phase == "$apply" || phase == "$digest" ) return;
			
			this.$apply();		
		};
	}]
);
