# Doc_Edit

Use a single web page to manage documents. No more trying to keep documents organized in a filesystem and having your way with desktop applications. Just an HTML wysiwyg editor and a local web database.

The application is designed to fit is a single page. It uses summernote as wysiwyg editor and a web SQL database to store documents and categories.

Because all data is stored in a web database, it is unique per browser and per user.

The input in the top of the page is the sole controller. It expects contents of the form [category/][document]. Hit enter to open the document, or create it if it does not already exist. Hit delete to suppress a document/category.
