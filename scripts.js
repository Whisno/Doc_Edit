/*global $:false */

/*  WHAT COULD BE NEXT

    - Export / import documents
    - Encrypted documents (protected by password)
    - Preferences (eg. on start, open new document or last document)
*/

(function () {
    'use strict';

    // Application-wide variables
    var database = null; // DB connector
    var current_document_id = null;

    function init_db() {
        var deferred = $.Deferred();
        database = openDatabase('document_editor', '1.0', 'Document Editor', 5 * 1024 * 1024);
        database.transaction(function (transaction) {
            var deferred_1 = $.Deferred();
            var deferred_2 = $.Deferred();
            transaction.executeSql("CREATE TABLE IF NOT EXISTS categories (\
                id INTEGER PRIMARY KEY,\
                name TEXT NOT NULL UNIQUE)", [], function() { deferred_1.resolve() }, errorHandler);
            transaction.executeSql("CREATE TABLE IF NOT EXISTS documents (\
                id INTEGER PRIMARY KEY,\
                name TEXT NOT NULL,\
                content TEXT,\
                category_id INTEGER REFERENCES categories(id),\
                uri TEXT NOT NULL UNIQUE)", [], function() { deferred_2.resolve() }, errorHandler);

            $.when(deferred_1, deferred_2).then(function(){ deferred.resolve() });
        });
        return deferred;
    }

    function nullDataHandler() { }

    function errorHandler(transaction, error) {
        console.log(error.message +' (Code '+error.code+')');
        return true; // causes rollback
    }

    function parse_uri(uri) {
        var category_name = false;
        var document_name = false;

        var separator_position = uri.indexOf('/');
        if (separator_position !== -1) {
            category_name = uri.substr(0, separator_position);
            document_name = uri.substr(separator_position + 1);
        } else {
            document_name = uri;
        }

        return {
            'category': category_name,
            'doc': document_name,
        };
    }

    function update_title() {
        // The div serves to give jquery a valid tree
        var title = $('<div>' + $('#summernote').code() + '</div>').find('h1');
        if (title.length > 0 && title[0].innerText !== '') {
            document.title = title[0].innerText;
        } else {
            document.title = 'Documents Editor';
        }
    }

    function update_navigator_list() {
        var deferred = $.Deferred();
        database.transaction(function (transaction) {
            transaction.executeSql("SELECT uri FROM documents", [], function(transaction, result) {
                var html_str = "";
                for (var i = 0; i < result.rows.length; i++) {
                    var val = result.rows.item(i).uri.replace('"', '&quot;').replace('&', '&amp;');
                    html_str += '<option value="' + val + '"/>';
                }
                $("#documents").html(html_str);
                deferred.resolve();
            }, errorHandler);
        });
        return deferred;
    }

    function set_document(doc) {
        current_document_id = doc.id;
        if ($("#navigator").val() !== doc.uri) {
            $("#navigator").val(doc.uri);
        }
        $('#summernote').code(doc.content);
        $('.note-editor .note-editable').focus();
        // NOTE : google chrome does not store cookies from local web pages
        document.cookie = "doc_id=" + doc.id;
    }

    function get_category(category_name, create) {
        var deferred = $.Deferred();
        database.transaction(function (transaction) {
            var query_search = "SELECT id FROM categories WHERE name = ?";
            transaction.executeSql(query_search, [category_name], function(transaction, result) {
                if (result.rows.length === 1) {
                    deferred.resolve({'id': result.rows.item(0).id});
                } else if (create === true) {
                    var confirmation_msg = "Do you want to create category '" + category_name + "' ?";
                    if (window.confirm(confirmation_msg)) {
                        var query_create = "INSERT INTO categories (name) VALUES (?)";
                        transaction.executeSql(query_create, [category_name], function(transaction, result) {
                            deferred.resolve({'id': result.insertId});
                        }, errorHandler);
                    } else {
                        deferred.reject();
                    }
                } else {
                    deferred.reject();
                }
            }, errorHandler);
        });
        return deferred;
    }

    function get_document(document_name, category_name, category_id, create) {
        var deferred = $.Deferred();
        var query_search = "SELECT * FROM documents WHERE name=? AND category_id=?";
        database.transaction(function (transaction) {
            transaction.executeSql(query_search, [document_name, category_id], function(transaction, result) {
                if (result.rows.length === 1) {
                    deferred.resolve(result.rows.item(0));
                } else if (create === true) {
                    var document_content = (! current_document_id ? $('#summernote').code() : '');
                    var document_uri = (category_name ? category_name + '/' : '') + document_name;
                    var query_create = "INSERT INTO documents (name, content, category_id, uri) VALUES (?, ?, ?, ?)";
                    transaction.executeSql(query_create, [document_name, document_content, category_id, document_uri], function(transaction, result) {
                        deferred.resolve({'id': result.insertId, 'content': document_content, 'uri': document_uri});
                    }, errorHandler);
                } else {
                    deferred.reject();
                }
            }, errorHandler);
        });
        return deferred;
    }

    function open_or_create(category_name, document_name) {
        var deferred_category = $.Deferred();
        var deferred_document = $.Deferred();

        // Find a category or create it
        if (category_name) {
            deferred_category = get_category(category_name, true);
        } else {
            deferred_category.resolve();
        }

        // Find a document or create it
        if (document_name) {
            deferred_category.then(function(category) {
                deferred_document = get_document(document_name, category_name, category && category.id, true).then(function(doc) {
                    set_document(doc);
                });
            }, function() {
                deferred_document.reject();
            });
        }

        return $.when(deferred_category, deferred_document).then(function() {
            update_navigator_list();
        }, function() {
            $('#navigator').val('');
        });
    }

    function save_document(document_content) {
        database.transaction(function (transaction) {
            transaction.executeSql("UPDATE documents SET content=? WHERE id=?", [document_content, current_document_id], nullDataHandler, errorHandler);
        });
    }

    function delete_document(category_name, document_name) {
        var deferred_category = $.Deferred();
        var deferred_deletion = $.Deferred();

        if (category_name) {
            deferred_category = get_category(category_name, false);
        } else {
            deferred_category.resolve();
        }

        $.when(deferred_category).then(function(category) {
            get_document(document_name, category_name, category && category.id, false).then(function(doc) {
                database.transaction(function (transaction) {
                    transaction.executeSql("DELETE FROM documents WHERE id=?", [doc.id], nullDataHandler, errorHandler);
                    if (doc.id === current_document_id){
                        $('#summernote').code('');
                        current_document_id = null;
                    }
                    deferred_deletion.resolve();
                });
            });
        });

        return $.when(deferred_category, deferred_deletion).then(function() {
            update_navigator_list();
            $('#navigator').val(category_name ? category_name + '/' : '');
            $('#navigator').trigger('input');
        });
    }

    function delete_category(category_name) {
        var deferred_deletion = $.Deferred();
        get_category(category_name, false).then(function(category) {
            database.transaction(function (transaction) {
                transaction.executeSql("SELECT id, name FROM documents WHERE category_id = ?", [category.id], function(transaction, result) {
                    var deferred_document = $.Deferred();
                    var deferred_category = $.Deferred();
                    if (result.rows.length > 0) {
                        // Ask for confirmation about deleting the category and its documents
                        var message = "The category '" + category_name + "' contains " + result.rows.length + " documents : ";
                        var documents_name = [];
                        for (var i = 0; i < result.rows.length; i++) {
                            documents_name.push(result.rows.item(i).name);
                        }
                        message += documents_name.join(', ');
                        message += ". If you proceed, they will be deleted.";
                        if (! window.confirm(message)) {
                            deferred_deletion.reject();
                            return;
                        }
                        // Delete documents
                        transaction.executeSql("DELETE FROM documents WHERE category_id = ?", [category.id], function() {
                            deferred_document.resolve();
                        }, errorHandler);

                        // Clear editor if the current document was deleted
                        for (i = 0; i < result.rows.length; i++) {
                            if (result.rows.item(i).id === current_document_id) {
                                $('#summernote').code('');
                                current_document_id = null;
                                break;
                            }
                        }
                    }
                    // Delete category
                    transaction.executeSql("DELETE FROM categories WHERE id = ?", [category.id], function() {
                        deferred_category.resolve();
                    }, errorHandler);

                    $.when(deferred_document, deferred_category).then(function() {
                        deferred_deletion.resolve();
                    });
                }, errorHandler);
            });
        });
        return $.when(deferred_deletion).done(function() {
            update_navigator_list();
            $('#navigator').val('');
            $('#navigator').trigger('input');
        });

    }

    $(window).on("beforeunload", function() {
        if (current_document_id === null && $('#summernote').code() !== "") {
            return "The current content has not been saved into a document.";
        }
    });

    // Wee need to make sure the database connexion is established before all.
    // But I hate useless tabs and countless callabacks. That's why following code line looks weird.
    // Maybe document readiness could be expressed as a promise, which would look better.
    $(document).ready(function() { init_db().then(function() {

        update_navigator_list();
        $('#navigator').focus();

        $("#navigator").bind('keyup', function(e) {
            var text = $(this).val();
            switch(e.which) {
                case 13: // Enter
                    var res = parse_uri(text);
                    open_or_create(res.category, res.doc);
                    break;
                case 46: // Delete
                    var res = parse_uri(text);
                    if (res.doc && window.confirm("Delete document '" + text + "' ?")) {
                        delete_document(res.category, res.doc);
                    } else if (res.category && window.confirm("Delete category '" + res.category + "' ?")) {
                        delete_category(res.category);
                    }
                    break;
            }
        });

        $('#summernote').summernote({
            toolbar: [
                ['preset', ['style']],
                ['fontsize', ['fontsize']],
                ['style', ['bold', 'italic', 'underline', 'strikethrough', 'clear', 'color']],
                ['layout', ['ul', 'ol', 'paragraph']],
                ['height', ['height']],
                ['insert', ['link', 'video', 'hr', 'table']],
		        ['code', ['codeview']],
            ],
            onChange: function(contents) {
                save_document(contents);
                update_title();
            },
            onkeyup: function(e) {
                if (e.shiftKey && e.keyCode === 9) {
                    $('#navigator').focus();
                }
            }
        });

        var last_session_doc_id = document.cookie.replace(/(?:(?:^|.*;\s*)doc_id\s*\=\s*([^;]*).*$)|^.*$/, "$1");
        if (last_session_doc_id !== "") {
            database.transaction(function (transaction) {
                transaction.executeSql("SELECT * FROM documents WHERE id = ?", [last_session_doc_id], function(transaction, result) {
                    if (result.rows.length === 1) {
                        set_document(result.rows.item(0));
                    }
                }, errorHandler);
            });
        }
    })});
}());
