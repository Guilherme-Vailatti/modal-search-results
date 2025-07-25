(function ($) {
	var queryParser = function (a) {
		var i, p, b = {};
		if (a === "") {
			return {};
		}
		for (i = 0; i < a.length; i += 1) {
			p = a[i].split('=');
			if (p.length === 2) {
				b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
			}
		}
		return b;
	};
	$.queryParams = function () {
		return queryParser(window.location.search.substr(1).split('&'));
	};
	$.hashParams = function () {
		return queryParser(window.location.hash.substr(1).split('&'));
	};


	window.Swiftype = window.Swiftype || {};
	Swiftype.root_url = Swiftype.root_url || 'https://api.swiftype.com';
	Swiftype.pingUrl = function (endpoint, callback) {
		var to = setTimeout(callback, 350);
		var img = new Image();
		img.onload = img.onerror = function () {
			clearTimeout(to);
			callback();
		};
		img.src = endpoint;
		return false;
	};
	Swiftype.pingSearchResultClick = function (engineKey, docId, callback) {
		var params = {
			t: new Date().getTime(),
			engine_key: engineKey,
			doc_id: docId,
			q: Swiftype.currentQuery
		};
		var url = Swiftype.root_url + '/api/v1/public/analytics/pc?' + $.param(params);
		Swiftype.pingUrl(url, callback);
	};

	$.fn.swiftypeSearch = function (options) {
		var options = $.extend({}, $.fn.swiftypeSearch.defaults, options);

		return this.each(function () {
			var $this = $(this);
			var config = $.meta ? $.extend({}, options, $this.data()) : options;
			$this.data('swiftype-config-search', config);

			$this.selectedCallback = function (data) {
				return function (e) {
					var $el = $(this);
					e.preventDefault();
					Swiftype.pingSearchResultClick(config.engineKey, data['id'], function () {
						config.onComplete($el);
					});
				};
			};

			$this.registerResult = function ($element, data) {
				$element.data('swiftype-item', data);
				$('a', $element).click($this.selectedCallback(data));
			};

			$this.getContentCache = function () {
				return $('#' + contentCacheId);
			};

			var $resultContainer = $(config.resultContainingElement),
				initialContentOfResultContainer = $resultContainer.html(),
				contentCacheId = 'st-content-cache',
				$contentCache = $this.getContentCache();

			var setSearchHash = function (query, page) {
				location.hash = "stq=" + encodeURIComponent(query) + "&stp=" + page;
			};

			var submitSearch = function (q, options) {
				let originalQuery = normalize(q);
				let query = normalize(q.latinise());
				options = $.extend({
					page: 1
				}, options);
				var params = {};

				if (!$contentCache.length) {
					$resultContainer.after("<div id='" + contentCacheId + "' style='display: none;'></div>");
					$contentCache.html(initialContentOfResultContainer).hide();
				}
				config.loadingFunction(query, $resultContainer);

				Swiftype.currentQuery = query;
				params['q'] = query;
				params['engine_key'] = config.engineKey;
				params['page'] = options.page;

				function handleFunctionParam(field) {
					if (field !== undefined) {
						var evald = field;
						if (typeof evald === 'function') {
							evald = evald.call();
						}
						return evald;
					}
					return undefined;
				}

				params['per_page'] = handleFunctionParam(config.perPage);
				params['search_fields'] = handleFunctionParam(config.searchFields);
				params['fetch_fields'] = handleFunctionParam(config.fetchFields);
				params['facets'] = handleFunctionParam(config.facets);
				params['filters'] = handleFunctionParam(config.filters);
				params['document_types'] = handleFunctionParam(config.documentTypes);
				params['functional_boosts'] = handleFunctionParam(config.functionalBoosts);
				params['sort_field'] = handleFunctionParam(config.sortField);
				params['sort_direction'] = handleFunctionParam(config.sortDirection);
				params['spelling'] = handleFunctionParam(config.spelling);
				params['highlight_fields'] = handleFunctionParam(config.highlightFields);

				$.ajax({
					dataType: "json",
					url: Swiftype.root_url + "/api/v1/public/engines/search.json?callback=?",
					data: params,
					xhrFields: { withCredentials: true },
					success: renderSearchResults
				});

				$("#st-search-input").val(originalQuery)
			};

			$(window).hashchange(function () {
				var params = $.hashParams();
				if (params.stq) {
					submitSearch(params.stq, {
						page: params.stp
					});
				} else {
					var $contentCache = $this.getContentCache();
					if ($contentCache.length) {
						$resultContainer.html($contentCache.html());
						$contentCache.remove();
					}
				}
			});

			var $containingForm = $this.parents('form');
			if ($containingForm) {
				$containingForm.bind('submit', function (e) {
					e.preventDefault();
					var searchQuery = $this.val();
					setSearchHash(searchQuery, 1);
				});
			}

			$(document).on('click', '[data-hash][data-page]', function (e) {
				e.preventDefault();
				var $this = $(this);
				setSearchHash($.hashParams().stq, $this.data('page'));
			});

			$(document).on('click', '[data-hash][data-spelling-suggestion]', function (e) {
				e.preventDefault();
				var $this = $(this);
				setSearchHash($this.data('spelling-suggestion'), 1);
			});

			var renderSearchResults = function (data) {
				if (typeof config.preRenderFunction === 'function') {
					config.preRenderFunction.call($this, data);
				}

				config.renderResultsFunction($this.getContext(), data);

				if (typeof config.postRenderFunction === 'function') {
					config.postRenderFunction.call($this, data);
				}
			};

			$this.getContext = function () {
				return {
					config: config,
					resultContainer: $resultContainer,
					registerResult: $this.registerResult
				};
			};

			$(window).hashchange(); // if the swiftype query hash is present onload (maybe the user is pressing the back button), submit a query onload
		});
	};

	var renderPagination = function (ctx, resultInfo) {
		var maxPagesType, maxPages = -1,
			config = ctx.config;
		$.each(resultInfo, function (documentType, typeInfo) {
			if (typeInfo.num_pages > maxPages) {
				maxPagesType = documentType;
				maxPages = typeInfo.num_pages;
			}
		});
		var currentPage = resultInfo[maxPagesType].current_page,
			totalPages = resultInfo[maxPagesType].num_pages;

		$(config.renderPaginationForType(maxPagesType, currentPage, totalPages)).appendTo(ctx.resultContainer);
	};


	var normalize = function (str) {
		return $.trim(str).toLowerCase();
	};

	function htmlEscape(str) {
		return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	var defaultRenderResultsFunction = function (ctx, data) {
		var $resultContainer = ctx.resultContainer,
			config = ctx.config;

		$resultContainer.html('');

		$.each(data.records, function (documentType, items) {
			$.each(items, function (idx, item) {
				ctx.registerResult($(config.renderFunction(documentType, item)).appendTo($resultContainer), item);
			});
		});

		renderPagination(ctx, data.info);
	};

	var defaultRenderFunction = function (document_type, item) {
		return '<div class="st-result"><h3 class="title"><a href="' + item['url'] + '" class="st-search-result-link">' + htmlEscape(item['title']) + '</a></h3></div>';
	};

    var defaultLoadingFunction = function (query, $resultContainer) {
    $resultContainer.html('<div class="loader" style="margin: 40px auto;"></div>');
    };


	var defaultOnComplete = function (elem) {
		window.location = elem.attr('href');
	};

	var setSearchTypeToAND = function (searchText) {
		if (searchText == null || searchText.trim() === "" || searchText === undefined || (searchText.trim()[0] === "\"" && searchText.trim()[searchText.trim().length - 1] === "\"")) {
            return searchText;
		}
		
		searchText = searchText.trim();

		var text = searchText.split(/(\s+)/);
		var doneText = "";
		var cleanText = [];
		
		var a;
		for (a = 0; a < text.length; a++) {
			if (text[a].trim().length > 0) {
			  cleanText.push(text[a].trim());
		  }
		}
		
		//caso só for uma palavra
		if (cleanText.length <= 1) return searchText;

		var i;  
		for (i = 0; i < cleanText.length; i++) {
			doneText = doneText + cleanText[i] + (i < (cleanText.length -1) ? " AND " : "");
		}

		return doneText;
	}

	var defaultPostRenderFunction = function (data) {
  var totalResultCount = 0;
  var $resultContainer = this.getContext().resultContainer;
  var spellingSuggestion = null;

  if (data['info']) {
    $.each(data['info'], function (index, value) {
      totalResultCount += value['total_result_count'];
      if (value['spelling_suggestion']) {
        spellingSuggestion = value['spelling_suggestion']['text'];
      }
    });
  }

  // ✅ Armazena o total globalmente para uso no renderPagination
  window.SwiftypeLastTotalResults = totalResultCount;

  if (totalResultCount === 0) {
    $resultContainer.html("<div id='st-no-results' class='st-no-results'>Nenhum resultado encontrado...</div>");
    return;
  }

  if (spellingSuggestion !== null) {
    $resultContainer.append('<div class="st-spelling-suggestion">Você quis dizer: <a href="#" data-hash="true" data-spelling-suggestion="' + spellingSuggestion + '">' + spellingSuggestion + '</a>?</div>');
  }
};



var defaultRenderPaginationForType = function (type, currentPage, totalPages) {
  var pages = `
    <div class="st-page-wrapper">
      <div class="st-page">
  `;

  if (currentPage != 1) {
    var previousPage = currentPage - 1;
    pages += `<a href="#" class="st-prev" data-hash="true" data-page="${previousPage}">&laquo;</a>`;
  }

  if (currentPage < totalPages) {
    var nextPage = currentPage + 1;
    pages += `<a href="#" class="st-next" data-hash="true" data-page="${nextPage}">&raquo;</a>`;
  }

  pages += `</div>`;

  // Total de resultados na mesma linha
  if (window.SwiftypeLastTotalResults !== undefined) {
    pages += `
      <div class="st-total-count">
        🔎 ${window.SwiftypeLastTotalResults} resultados encontrados
      </div>
    `;
  }

  pages += `</div>`;
  return pages;
};




	$.fn.swiftypeSearch.defaults = {
		attachTo: undefined,
		documentTypes: undefined,
		facets: undefined,
		filters: undefined,
		engineKey: undefined,
		searchFields: undefined,
		functionalBoosts: undefined,
		sortField: undefined,
		sortDirection: undefined,
		fetchFields: undefined,
		highlightFields: undefined,
		preRenderFunction: undefined,
		postRenderFunction: defaultPostRenderFunction,
		loadingFunction: defaultLoadingFunction,
		renderResultsFunction: defaultRenderResultsFunction,
		renderFunction: defaultRenderFunction,
		renderPaginationForType: defaultRenderPaginationForType,
		onComplete: defaultOnComplete,
		perPage: 10,
		spelling: 'strict'
	};
})(jQuery);