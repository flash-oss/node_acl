/*
  MongoDB Backend.
  Implementation of the storage backend using MongoDB
*/

var contract = require("./contract");
var _ = require("lodash");

// Name of the collection where meta and allowsXXX are stored.
// If prefix is specified, it will be prepended to this name, like acl_resources
var aclCollectionName = "resources";

function MongoDBBackend({ client, db, prefix, useSingle, useRawCollectionNames }) {
    this.client = client;
    this.db = db || client.db(client.s.options.dbName);
    this.prefix = prefix || "acl_";
    this.useSingle = Boolean(useSingle);
    this.useRawCollectionNames = useRawCollectionNames === false; // requires explicit boolean false value
}

MongoDBBackend.prototype = {
    async close(cb) {
        try {
            if (this.client) {
                await this.client.close();
            }
            cb();
        } catch (err) {
            cb(err);
        }
    },

    /**
     Begins a transaction.
  */
    begin() {
        // returns a transaction object(just an array of functions will do here.)
        return [];
    },

    /**
     Ends a transaction (and executes it)
  */
    async end(transaction, cb) {
        contract(arguments).params("array", "function").end();
        try {
            const promises = transaction.map((fn) => fn());
            await Promise.all(promises);
            cb();
        } catch (err) {
            cb(err);
        }
    },

    /**
    Cleans the whole storage.
  */
    async clean(cb) {
        contract(arguments).params("function").end();
        try {
            const collections = await this.db.collections();
            const promises = collections.map((coll) => coll.drop());
            await Promise.all(promises);
            cb();
        } catch (err) {
            cb(err);
        }
    },

    /**
     Gets the contents at the bucket's key.
  */
    async get(bucket, key, cb) {
        contract(arguments).params("string", "string|number", "function").end();
        try {
            key = encodeText(key);
            var searchParams = this.useSingle ? { _bucketname: bucket, key: key } : { key: key };
            var collName = this.useSingle ? aclCollectionName : bucket;

            let collection = this.db.collection(this.prefix + this.removeUnsupportedChar(collName));

            if (!collection) throw new Error(`Cannot find the collection ${collName}`);

            // Excluding bucket field from search result
            var doc = await collection.findOne(searchParams, { projection: { _bucketname: 0 } });
            if (!_.isObject(doc)) return cb(undefined, []);
            doc = fixKeys(doc);
            cb(undefined, _.without(_.keys(doc), "key", "_id", "_bucketname"));
        } catch (err) {
            cb(err);
        }
    },

    /**
    Returns the union of the values in the given keys.
  */
    async union(bucket, keys, cb) {
        contract(arguments).params("string", "array", "function").end();
        try {
            keys = encodeAll(keys);
            var searchParams = this.useSingle ? { _bucketname: bucket, key: { $in: keys } } : { key: { $in: keys } };
            var collName = this.useSingle ? aclCollectionName : bucket;

            let collection = this.db.collection(this.prefix + this.removeUnsupportedChar(collName));

            if (!collection) throw new Error(`Cannot find the collection ${collName}`);

            var docs = await collection.find(searchParams, { projection: { _bucketname: 0 } }).toArray();
            if (!docs.length) return cb(undefined, []);

            var keyArrays = [];
            docs = fixAllKeys(docs);
            for (const doc of docs) {
                keyArrays.push(...Object.keys(doc));
            }
            cb(undefined, _.without(_.union(keyArrays), "key", "_id", "_bucketname"));
        } catch (err) {
            cb(err);
        }
    },

    /**
    Adds values to a given key inside a bucket.
  */
    add(transaction, bucket, key, values) {
        contract(arguments).params("array", "string", "string|number", "string|array|number").end();

        if (key == "key") throw new Error("Key name 'key' is not allowed.");
        key = encodeText(key);
        var collectionIndex = this.useSingle ? { _bucketname: 1, key: 1 } : { key: 1 };
        var updateParams = this.useSingle ? { _bucketname: bucket, key: key } : { key: key };
        var collName = this.useSingle ? aclCollectionName : bucket;
        transaction.push(async () => {
            values = makeArray(values);

            let collection = this.db.collection(this.prefix + this.removeUnsupportedChar(collName));

            if (!collection) throw new Error(`Cannot find the collection ${collName}`);

            // build doc from array values
            var doc = {};
            for (const value of values) {
                doc[value] = true;
            }

            // update documents
            await collection.updateMany(updateParams, { $set: doc }, { safe: true, upsert: true });
        });

        transaction.push(async () => {
            let collection = this.db.collection(this.prefix + this.removeUnsupportedChar(collName));

            if (!collection) throw new Error(`Cannot find the collection ${collName}`);

            await collection.createIndex(collectionIndex);
        });
    },

    /**
     Delete the given key(s) at the bucket
  */
    del(transaction, bucket, keys) {
        contract(arguments).params("array", "string", "string|array").end();
        keys = makeArray(keys);
        var updateParams = this.useSingle ? { _bucketname: bucket, key: { $in: keys } } : { key: { $in: keys } };
        var collName = this.useSingle ? aclCollectionName : bucket;

        transaction.push(async () => {
            let collection = this.db.collection(this.prefix + this.removeUnsupportedChar(collName));

            if (!collection) throw new Error(`Cannot find the collection ${collName}`);

            await collection.deleteMany(updateParams, { safe: true });
        });
    },

    /**
    Removes values from a given key inside a bucket.
  */
    remove(transaction, bucket, key, values) {
        contract(arguments).params("array", "string", "string|number", "string|array|number").end();
        key = encodeText(key);
        var updateParams = this.useSingle ? { _bucketname: bucket, key: key } : { key: key };
        var collName = this.useSingle ? aclCollectionName : bucket;

        values = makeArray(values);
        transaction.push(async () => {
            let collection = this.db.collection(this.prefix + this.removeUnsupportedChar(collName));

            if (!collection) throw new Error(`Cannot find the collection ${collName}`);

            // build doc from array values
            var doc = {};
            for (const value of values) {
                doc[value] = true;
            }

            // update documents
            await collection.updateMany(updateParams, { $unset: doc }, { safe: true, upsert: true });
        });
    },

    removeUnsupportedChar(text) {
        if (!this.useRawCollectionNames && (typeof text === "string" || text instanceof String)) {
            text = decodeURIComponent(text);
            text = text.replace(/[/\s]/g, "_"); // replaces slashes and spaces
        }
        return text;
    },
};

function encodeText(text) {
    if (typeof text == "string" || text instanceof String) {
        text = encodeURIComponent(text);
        text = text.replace(/\./g, "%2E");
    }
    return text;
}

function decodeText(text) {
    if (typeof text == "string" || text instanceof String) {
        text = decodeURIComponent(text);
    }
    return text;
}

function encodeAll(arr) {
    if (Array.isArray(arr)) {
        return arr.map(encodeText);
    } else {
        return arr;
    }
}

function fixKeys(doc) {
    if (!doc) return doc;
    return _.mapKeys(doc, (value, key) => decodeText(key));
}

function fixAllKeys(docs) {
    if (!(docs && docs.length)) return docs;
    return docs.map(fixKeys);
}

function makeArray(arr) {
    return Array.isArray(arr) ? encodeAll(arr) : [encodeText(arr)];
}

exports = module.exports = MongoDBBackend;
