define(["storymaps/utils/MovableGraphic","esri/layers/FeatureLayer","dojo/_base/array","esri/arcgis/utils","esri/arcgis/Portal","esri/map","esri/tasks/query","esri/tasks/QueryTask","esri/request","esri/urlUtils","lib/jquery/jquery-1.10.2.min"],
	function(MoveableGraphic,FeatureLayer,array,arcgisUtils,arcgisPortal,Map,Query,QueryTask,esriRequest,urlUtils){

		/**
		* Core
		* @class Core
		*
		* Main class for story map application
		*
		* Dependencies: Jquery 1.10.2
		*/

		var _portal = new arcgisPortal.Portal("http://www.arcgis.com"),
		_storyLayer,
		_sortOrder = 'DESC',
		_currentSearch = '',
		_displayLength = 20,
		_allResults,
		_pages,
		_currentPage;

		function init ()
		{
			var urlSearch = urlUtils.urlToObject(location.href);
			if (urlSearch.query && urlSearch.query.service){
				_storyLayer = new FeatureLayer(urlSearch.query.service);
			}
			else if (configOptions.featureService){
				_storyLayer = new FeatureLayer(configOptions.featureService);
			}
			else{
				promptForService();
			}

			if (_storyLayer){
				login();
			}
		}

		function login()
		{
			_portal.signIn().then(function(){
				var load = false;
				array.forEach(esri.id.credentials,function(user){
					if($.inArray(user.userId,configOptions.authorizedEditors) >= 0){
						load = true;
					}
				});

				if (load){
					$('.loader, #service-prompt').hide();
					esri.id.getCredential(_storyLayer.url);
					addFormEvents();
					$("#service-name").html(_storyLayer.name);
					$("#search-field").show();
				}
				else{
					alert("You do not have permission to edit this service.");
					location.reload();
				}
			});
		}

		function addFormEvents()
		{
			$("#item-search").click(function(){
				queryItem(getItemId($("#form-item").val()));
			});

			$("#item-search-submit").click(function(){
				searchItems($("#form-item-search").val());
			});

			$("#form-item-search").keypress(function(event){
				if(event.which === 13){
					searchItems($("#form-item-search").val());
				}
			});

			$("#item-error-close").click(function(){
				$("#item-error").hide();
			});

			$('#option-hide').click(function(){
				if ($(this).is(':checked')){
					$('body').addClass('showHideField');
				}
				else{
					$('body').removeClass('showHideField');
				}	
			});

			$('#option-reverse').click(function(){
				if (_sortOrder === 'DESC'){
					_sortOrder = 'ASC';
				}
				else{
					_sortOrder = 'DESC';
				}
				searchItems(_currentSearch);
			});

			searchItems();
		}

		function getItemId(str)
		{
			if (str.length === 32){
				return str;
			}
			else{
				var index = (str.search("id=") + 3);
				var newStr = str.slice(index,(index + 32));

				return newStr;
			}
		}

		function searchItems(str,start)
		{
			$(".search-message").show();
			var query = new Query();
			query.outFields = ["*"];
			query.returnGeometry = true;
			query.num = _displayLength;
			query.start = start ? start : 0;
			query.orderByFields = ["FID " + _sortOrder];
			if (str){
				var searchStr = str.replace("'","''");
				query.where = "(Tweet_ID LIKE '%" + searchStr + "%' OR Text LIKE '%" + searchStr + "%' OR FID LIKE '%" + searchStr + "%') AND Matched = 1";
			}
			else{
				query.where = "Vetted = 'U' AND Matched = 1";
			}

			var queryTask = new QueryTask(_storyLayer.url);
			queryTask.execute(query,function(result){	

				$(".results tbody").empty();

				setResults(result.features,query,str);

				$(".results").show();
				$(".search-message").hide();
			});
		}

		function setResults(tweets,query,search)
		{
			_allResults = tweets;

			if (query.start === 0){
				_currentPage = 0;
				_storyLayer.queryCount(query,function(count){
					_pages = Math.floor(count/_displayLength) + (count % _displayLength > 0 ? 1 : 0);
					_currentSearch = search;

					var htmlString = '\
					<p class="pagination-previous">\
						<span class="icon-left-arrow"></span>\
					</p>';
					
					var pageString = '\
					<li class="pagination-page">\
						<input type="text" value="1" /> of ' + (_pages + 1) + '\
					</li>';

					htmlString = htmlString + pageString;
					
					htmlString = htmlString + '\
					<p class="pagination-next">\
						<span class="icon-right-arrow"></span>\
					</p>';

					$("#pager .pagination").html(htmlString);

					$(".pagination-previous").click(function(){
						if (_currentPage > 0){
							_currentPage--;
							$(".pagination-page input").val(_currentPage + 1);

							searchItems(search,(_currentPage * _displayLength));
						}
					});

					$(".pagination-next").click(function(){
						if (_currentPage < _pages){
							_currentPage++;
							$(".pagination-page input").val(_currentPage + 1);

							searchItems(search,(_currentPage * _displayLength));
						}
					});

					$(".pagination-page input").keypress(function(event){
						if(event.which === 13){
							_currentPage = $(this).val() - 1;

							searchItems(search,(_currentPage * _displayLength));
						}
					});
				});
			}

			displayResults(_allResults.slice(0,_displayLength - 1));

		}

		function displayResults(result){
			$(".results tbody").html("");
			array.forEach(result,function(ftr){
				$(".results tbody").append('\
					<tr class="hidden">\
						<td class="tweet-' + ftr.attributes.Tweet_ID + ' tweet-display">' + ftr.attributes.Text + '</td>\
						<td><strong>FID</strong>: ' + ftr.attributes.FID + '<br><strong>Tweet ID</strong>: ' + ftr.attributes.Tweet_ID + '<br><strong>User ID</strong>: ' + ftr.attributes.User_ID + '<br><strong>Location</strong>: ' + ftr.attributes.Standardized_Location + '</td>\
						<td class="approve-tweet align-center"><span class="approve-yes approve-btn btn gray' + getActiveState(ftr,'approveYes') + '">Yes</span><span class="approve-no approve-btn btn gray' + getActiveState(ftr,'approveNo') + '">No</span></td>\
						<td class="hide-tweet align-center hide-field"><span class="hide-btn btn gray' + getActiveState(ftr,'hide') + '">Hide</span></td>\
					</tr>\
				');

				$(".results tbody tr").last().data('ftr',ftr);

				var request = esriRequest({
					url: 'https://api.twitter.com/1/statuses/oembed.json?omit_script=true&id=' + ftr.attributes.Tweet_ID,
					handleAs: "json",
					callbackParamName: "callback"
				});
				request.then(function(tweets){
					$('.tweet-' + ftr.attributes.Tweet_ID).html(tweets.html);
					$('.tweet-' + ftr.attributes.Tweet_ID).parents('tr').removeClass('hidden');
					twttr.widgets.load();
				});

			});

			$('.approve-btn').click(function(){
				var graphic = $(this).parents('tr').data('ftr').attributes;
				$(this).parents('tr').addClass('data-changed');
				$(this).toggleClass('active');
				$(this).siblings('.approve-btn').removeClass('active');
				if ($(this).hasClass('active') && $(this).hasClass('approve-yes')){
					graphic.Vetted = 'T';
				}
				else if ($(this).hasClass('active') && $(this).hasClass('approve-no')){
					graphic.Vetted = 'F';
				}
				else{
					graphic.Vetted = 'U';
				}
				editApplicaton();
			});

			$('.hide-btn').click(function(){
				$(this).toggleClass('active');
				var graphic = $(this).parents('tr').data('ftr').attributes;
				$(this).parents('tr').addClass('data-changed');
				if ($(this).hasClass('active')){
					graphic.Hide = '1';
				}
				else{
					graphic.Hide = '0';
				}
				editApplicaton();
			});
		}

		function queryItem(item)
		{
			$(".search-message").show();
			arcgisUtils.getItem(item).then(function(result){
				$(".search-message").hide();
				var item = result.item;
				if (item.type === "Web Mapping Application"){
					var thumbnail = "http://www.arcgis.com/sharing/rest/content/items/" + item.id + "/info/" + item.thumbnail;
					$("#item-error").hide();
					$("#form-name").val(item.title);
					$("#form-description").val(item.snippet);
					$("#form-publisher").val(item.owner);
					$("#form-url").val(item.url);
					$("#form-thumbnail").val(thumbnail);
					$("#thumbnail-preview").attr("src",thumbnail);
				}
				else{
					$("#item-error").show();
				}
			},function(){
				$("#item-error").show();
			});
		}

		function getActiveState(ftr,item)
		{
			if (item === 'approveYes' && ftr.attributes.Vetted === 'T'){
				return ' active';
			}
			else if (item === 'approveNo' && ftr.attributes.Vetted === 'F'){
				return ' active';
			}
			else if (item === 'hide' && ftr.attributes.Hide === '1'){
				return ' active';
			}
			else{
				return '';
			}
		}

		function editApplicaton()
		{
			var features = [];

			$('.data-changed').each(function(){
				var ftr = $(this).data('ftr');
				features.push(ftr);
			});

			_storyLayer.applyEdits(null,features).then(function(result){
				var error = false;
				array.forEach(result,function(r){
					if (!r.success){
						error = true;
						console.log(r.error);
					}
				});
				if(error){
					$(".edit-message").hide();
					$(".edit-message.error").show();
				}
				else{
					$(".edit-message").hide();
					$(".edit-message.success").show();
				}
				$('.data-changed').removeClass('data-changed');
			},function(){
				$(".edit-message").hide();
				$(".edit-message.error").show();
				$('.data-changed').removeClass('data-changed');
			});
		}

		function promptForService()
		{
			$('.loader').hide();
			$('#service-prompt').show();

			$("#item-service-submit").click(function(){
				if ($("#service-prompt input").val()){
					$(".service-message").show();
					_storyLayer = new FeatureLayer($("#service-prompt input").val());
					login();
				}
			});

			$("#service-prompt input").keypress(function(event){
				if(event.which === 13){
					if ($("#service-prompt input").val()){
						$(".service-message").show();
						_storyLayer = new FeatureLayer($("#service-prompt input").val());
						login();
					}
				}
			});
		}

		return {
			init: init
		};
});