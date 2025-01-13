# NODE ACL - Access Control Lists for Node

This module provides a minimalistic ACL implementation inspired by Zend_ACL.

## ⚠️ This project is looking for new maintainers ⚠️

<span style="color:red">Otherwise, we plan to leave this project unmaintained. Meaning, no bugfixes, no TS fixes, no new releases, no dependency upgrades, nothing.</span>

Please create an issue with a proposal to take over this git repo and the NPM access.

---

## Why this project exists?

When you develop a website or application you will soon notice that sessions are not enough to protect all the
available resources. Avoiding that malicious users access other users content proves a much more
complicated task than anticipated. ACL can solve this problem in a flexible and elegant way.

Create roles and assign roles to users. Sometimes it may even be useful to create one role per user,
to get the finest granularity possible, while in other situations you will give the _asterisk_ permission
for admin kind of functionality.

A Redis, MongoDB and In-Memory based backends are provided built-in in the module. There are other third party backends such as [_knex_](https://github.com/christophertrudel/node_acl_knex) based, [_firebase_](https://github.com/tonila/node_acl_firebase) and [_elasticsearch_](https://github.com/adnanesaghir/acl-elasticsearch-backend). There is also an alternative memory backend that supports [_regexps_](https://github.com/futurechan/node_acl-mem-regexp).

**Forked, improved and renamed from [`acl`](https://github.com/OptimalBits/node_acl) to [`acl2`](https://www.npmjs.com/package/acl2)**

### Breaking changes comparing to the original `acl`

- The backend constructors take options object instead of multiple argument.

Original `acl`:

```js
new ACL.mongodbBackend(db, prefix, useSingle, useRawCollectionNames);
new ACL.redisBackend(redis, prefix);
```

New `acl2`:

```js
new ACL.mongodbBackend({ client, db, prefix = "acl_", useSingle, useRawCollectionNames })
new ACL.redisBackend({ redis, prefix = "acl_" })
```

- The new default `"acl_"` prefix for both Redis and MongoDB.

- Modern code infrastructure.

### Other notable changes comparing to the original `acl`

- ES6
- ESLint
- Prettier
- Promises only, no callbacks
- Upgraded all possible dependencies
- Made unit test debuggable, split them by backend type
- MongoDB backend accepts either `client` or `db` [objects](https://github.com/mongodb/node-mongodb-native/blob/3.0/CHANGES_3.0.0.md)
- Removed all possible warnings
- Run CI tests using multiple MongoDB versions.

## Features

- Users
- Roles
- Hierarchies
- Resources
- Express middleware for protecting resources.
- Robust implementation with good unit test coverage.

## Installation

Using npm:

```shell script
npm install acl2
```

Optionally:

```shell script
npm install mongodb

npm install redis
```

## Documentation

- [addUserRoles](#addUserRoles)
- [removeUserRoles](#removeUserRoles)
- [userRoles](#userRoles)
- [roleUsers](#roleUsers)
- [hasRole](#hasRole)
- [addRoleParents](#addRoleParents)
- [removeRoleParents](#removeRoleParents)
- [removeRole](#removeRole)
- [removeResource](#removeResource)
- [allow](#allow)
- [removeAllow](#removeAllow)
- [allowedPermissions](#allowedPermissions)
- [isAllowed](#isAllowed)
- [areAnyRolesAllowed](#areAnyRolesAllowed)
- [whatResources](#whatResources)
- [middleware](#middleware)
- [backend](#backend)

## Examples

Create your acl module by requiring it and instantiating it with a valid backend instance:

```javascript
const ACL = require("acl2");

// Using Redis backend
acl = new ACL(new ACL.redisBackend({ redis: redisClient }));

// Or Using the memory backend
acl = new ACL(new ACL.memoryBackend());

// Or Using the MongoDB backend
acl = new ACL(new ACL.mongodbBackend({ client: mongoClient }));
```

See below for full list of backend constructor arguments.

All the following functions return a promise.

Create roles implicitly by giving them permissions:

```javascript
// guest is allowed to view blogs
await acl.allow("guest", "blogs", "view");

// allow function accepts arrays as any parameter
await acl.allow("member", "blogs", ["edit", "view", "delete"]);
```

Users are likewise created implicitly by assigning them roles:

```javascript
await acl.addUserRoles("joed", "guest");
```

Hierarchies of roles can be created by assigning parents to roles:

```javascript
await acl.addRoleParents("baz", ["foo", "bar"]);
```

Note that the order in which you call all the functions is irrelevant (you can add parents first and assign permissions to roles later)

```javascript
await acl.allow("foo", ["blogs", "forums", "news"], ["view", "delete"]);
```

Use the wildcard to give all permissions:

```javascript
await acl.allow("admin", ["blogs", "forums"], "*");
```

Sometimes is necessary to set permissions on many different roles and resources. This would
lead to unnecessary nested callbacks for handling errors. Instead use the following:

```javascript
await acl.allow([
  {
    roles: ["guest", "member"],
    allows: [
      { resources: "blogs", permissions: "get" },
      { resources: ["forums", "news"], permissions: ["get", "put", "delete"] },
    ],
  },
  {
    roles: ["gold", "silver"],
    allows: [
      { resources: "cash", permissions: ["sell", "exchange"] },
      { resources: ["account", "deposit"], permissions: ["put", "delete"] },
    ],
  },
]);
```

You can check if a user has permissions to access a given resource with _isAllowed_:

```javascript
const res = await acl.isAllowed("joed", "blogs", "view");
if (res) {
  console.log("User joed is allowed to view blogs");
}
```

Of course arrays are also accepted in this function:

```javascript
await acl.isAllowed("jsmith", "blogs", ["edit", "view", "delete"]);
```

Note that all permissions must be fulfilled in order to get _true_.

Sometimes is necessary to know what permissions a given user has over certain resources:

```javascript
const permissions = await acl.allowedPermissions("james", ["blogs", "forums"]);
console.log(permissions);
```

It will return an array of resource:[permissions] like this:

```javascript
[{ blogs: ["get", "delete"] }, { forums: ["get", "put"] }];
```

Finally, we provide a middleware for Express for easy protection of resources.

```javascript
acl.middleware();
```

We can protect a resource like this:

```javascript
app.put('/blogs/:id', acl.middleware(), function(req, res, next){…}
```

The middleware will protect the resource named by _req.url_, pick the user from _req.session.userId_ and check the permission for _req.method_, so the above would be equivalent to something like this:

```javascript
await acl.isAllowed(req.session.userId, "/blogs/12345", "put");
```

The middleware accepts 3 optional arguments, that are useful in some situations. For example, sometimes we
cannot consider the whole url as the resource:

```javascript
app.put('/blogs/:id/comments/:commentId', acl.middleware(3), function(req, res, next){…}
```

In this case the resource will be just the three first components of the url (without the ending slash).

It is also possible to add a custom userId or check for other permissions than the method:

```javascript
app.put('/blogs/:id/comments/:commentId', acl.middleware(3, 'joed', 'post'), function(req, res, next){…}
```

## Methods

<a name="addUserRoles"/>

### addUserRoles( userId, roles )

Adds roles to a given user id.

**Arguments**

```javascript
    userId   {String} User id.
    roles    {String|Array} Role(s) to add to the user id.
```

---

<a name="removeUserRoles"/>

### removeUserRoles( userId, roles )

Remove roles from a given user.

**Arguments**

```javascript
    userId   {String} User id.
    roles    {String|Array} Role(s) to remove to the user id.
```

---

<a name="userRoles" />

### userRoles( userId )

Return all the roles from a given user.

**Arguments**

```javascript
    userId   {String} User id.
```

---

<a name="roleUsers" />

### roleUsers( roleName )

Return all users who has a given role.

**Arguments**

```javascript
    roleName   {String} User id.
```

---

<a name="hasRole" />

### hasRole( userId, rolroleNameename )

Return boolean whether user has the role

**Arguments**

```javascript
    userId   {String} User id.
    roleName {String} role name.
```

---

<a name="addRoleParents" />

### addRoleParents( role, parents )

Adds a parent or parent list to role.

**Arguments**

```javascript
    role     {String} Child role.
    parents  {String|Array} Parent role(s) to be added.
```

---

<a name="removeRoleParents" />

### removeRoleParents( role, parents )

Removes a parent or parent list from role.

If `parents` is not specified, removes all parents.

**Arguments**

```javascript
    role     {String} Child role.
    parents  {String|Array} Parent role(s) to be removed [optional].
```

---

<a name="removeRole" />

### removeRole( role )

Removes a role from the system.

**Arguments**

```javascript
    role     {String} Role to be removed
```

---

<a name="removeResource" />

### removeResource( resource )

Removes a resource from the system

**Arguments**

```javascript
    resource {String} Resource to be removed
```

---

<a name="allow" />

### allow( roles, resources, permissions )

Adds the given permissions to the given roles over the given resources.

**Arguments**

```javascript
    roles       {String|Array} role(s) to add permissions to.
    resources   {String|Array} resource(s) to add permisisons to.
    permissions {String|Array} permission(s) to add to the roles over the resources.
```

### allow( permissionsArray )

**Arguments**

```javascript
    permissionsArray {Array} Array with objects expressing what permissions to give.
       [{roles:{String|Array}, allows:[{resources:{String|Array}, permissions:{String|Array}]]
```

---

<a name="removeAllow" />

### removeAllow( role, resources )

Remove permissions from the given roles owned by the given role.

Note: we loose atomicity when removing empty role_resources.

**Arguments**

```javascript
    role        {String}
    resources   {String|Array}
    permissions {String|Array}
```

---

<a name="allowedPermissions" />

### allowedPermissions( userId, resources )

Returns all the allowable permissions a given user have to
access the given resources.

It returns an array of objects where every object maps a
resource name to a list of permissions for that resource.

**Arguments**

```javascript
    userId    {String} User id.
    resources {String|Array} resource(s) to ask permissions for.
```

---

<a name="isAllowed" />

### isAllowed( userId, resource, permissions )

Checks if the given user is allowed to access the resource for the given
permissions (note: it must fulfill all the permissions).

**Arguments**

```javascript
    userId      {String} User id.
    resource    {String} resource to ask permissions for.
    permissions {String|Array} asked permissions.
```

---

<a name="areAnyRolesAllowed" />

### areAnyRolesAllowed( roles, resource, permissions )

Returns true if any of the given roles have the right permissions.

**Arguments**

```javascript
    roles       {String|Array} Role(s) to check the permissions for.
    resource    {String} resource to ask permissions for.
    permissions {String|Array} asked permissions.
```

---

<a name="whatResources" />

### whatResources(role) : {resourceName: [permissions]}

Returns what resources a given role has permissions over.

**Arguments**

```javascript
    role        {String|Array} Roles
```

whatResources(role, permissions) : resources

Returns what resources a role has the given permissions over.

**Arguments**

```javascript
    role        {String|Array} Roles
    permissions {String|Array} Permissions
```

---

<a name="middleware" />

### middleware( [numPathComponents, userId, permissions] )

Middleware for express.

To create a custom getter for userId, pass a function(req, res) which returns the userId when called (must not be async).

**Arguments**

```javascript
    numPathComponents {Number} number of components in the url to be considered part of the resource name.
    userId            {String} the user id for the acl system (defaults to req.session.userId)
    permissions       {String|Array} the permission(s) to check for (defaults to req.method.toLowerCase())
```

---

<a name="backend" />

### mongodbBackend

Creates a MongoDB backend instance.

**Arguments**

```javascript
    client    {Object} MongoClient instance. If missing, the `db` will be used.
    db        {Object} Database instance. If missing, the `client` will be used.
    prefix    {String} Optional collection prefix. Default is "acl_".
    useSingle {Boolean} Create one collection for all resources (defaults to false)
```

Example:

```javascript
const client = await require("mongodb").connect(
  "mongodb://127.0.0.1:27017/acl_test"
);
const ACL = require("acl2");
const acl = new ACL(new ACL.mongodbBackend({ client, useSingle: true }));
```

### redisBackend

Creates a Redis backend instance.

**Arguments**

```javascript
    client    {Object} Redis client instance.
    prefix    {String} Optional prefix. Default is "acl_".
```

Example:

```javascript
const client = await require("redis").createClient(6379, "127.0.0.1").connect();
const ACL = require("acl2");
const acl = new ACL(
  new acl.redisBackend({ redis: client, prefix: "my_acl_prefix_" })
);
```

## Tests

Run tests with `npm`. Requires both local databases running - MongoDB and Redis.

```shell script
npm test
```

You can run tests for Memory, Redis, or MongoDB only like this:

```shell script
npm run test_memory
npm run test_redis
npm run test_mongo
npm run test_mongo_single
```
