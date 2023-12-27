/* eslint-disable */

/**
  Backend Interface.

  Implement this API for providing a backend for the acl module.
*/

const contract = require("./contract");

const Backend = {
    /**
     Begins a transaction.
  */
    async begin() {
        // returns a transaction object
    },

    /**
     Ends a transaction (and executes it)
  */
    async end(transaction) {
        // Execute transaction
    },

    /**
    Cleans the whole storage.
  */
    async clean() {},

    /**
     Gets the contents at the bucket's key.
  */
    async get(bucket, key) {
        contract(arguments).params("string", "string").end();
    },

    /**
     Gets the union of contents of the specified keys in each of the specified buckets and returns
     a mapping of bucket to union.
  */
    async unions(bucket, keys) {
        contract(arguments).params("array", "array").end();
    },

    /**
    Returns the union of the values in the given keys.
  */
    async union(bucket, keys) {
        contract(arguments).params("string", "array").end();
    },

    /**
    Adds values to a given key inside a bucket.
  */
    async add(transaction, bucket, key, values) {
        contract(arguments).params("object", "string", "string", "string|array").end();
    },

    /**
     Delete the given key(s) at the bucket
  */
    async del(transaction, bucket, keys) {
        contract(arguments).params("object", "string", "string|array").end();
    },

    /**
    Removes values from a given key inside a bucket.
  */
    async remove(transaction, bucket, key, values) {
        contract(arguments).params("object", "string", "string", "string|array`").end();
    },
};

exports = module.exports = Backend;
