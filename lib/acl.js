/*
  ACL System inspired on Zend_ACL.

  All functions accept strings, objects or arrays unless specified otherwise.

  '*' is used to express 'all'

  Database structure in Redis (using default prefix 'acl')

  Users:

  acl_roles_{userid} = set(roles)

  Roles:

  acl_roles = {roleNames} // Used to remove all the permissions associated to ONE resource.

  acl_parents_{roleName} = set(parents)
  acl_resources_{roleName} = set(resourceNames)

  Permissions:

  acl_allows_{resourceName}_{roleName} = set(permissions)

  Note: user ids, role names and resource names are all case sensitive.

  Roadmap:
    - Add support for locking resources. If a user has roles that gives him permissions to lock
      a resource, then he can get exclusive write operation on the locked resource.
      This lock should expire if the resource has not been accessed in some time.
*/
const _ = require("lodash"),
    util = require("util"),
    contract = require("./contract");

contract.debug = true;

const Acl = function (backend, logger, options) {
    contract(arguments).params("object").params("object", "object").params("object", "object", "object").end();

    options = _.extend(
        {
            buckets: {
                meta: "meta",
                parents: "parents",
                permissions: "permissions",
                resources: "resources",
                roles: "roles",
                users: "users",
            },
        },
        options
    );

    this.logger = logger;
    this.backend = backend;
    this.options = options;
};

/**
  addUserRoles( userId, roles )

  Adds roles to a given user id.

  @param {String} User id.
  @param {String|Array} Role(s) to add to the user id.
  @return {Promise} Promise resolved when finished
*/
Acl.prototype.addUserRoles = async function (userId, roles) {
    contract(arguments).params("string", "string|array").end();

    const transaction = await this.backend.begin();
    await this.backend.add(transaction, this.options.buckets.meta, "users", userId);
    await this.backend.add(transaction, this.options.buckets.users, userId, roles);

    if (Array.isArray(roles)) {
        for (const role of roles) {
            await this.backend.add(transaction, this.options.buckets.roles, role, userId);
        }
    } else {
        await this.backend.add(transaction, this.options.buckets.roles, roles, userId);
    }

    return await this.backend.end(transaction);
};

/**
  removeUserRoles( userId, roles )

  Remove roles from a given user.

  @param {String} User id.
  @param {String|Array} Role(s) to remove to the user id.
  @return {Promise} Promise resolved when finished
*/
Acl.prototype.removeUserRoles = async function (userId, roles) {
    contract(arguments).params("string", "string|array").end();

    const transaction = await this.backend.begin();
    await this.backend.remove(transaction, this.options.buckets.users, userId, roles);

    if (Array.isArray(roles)) {
        for (const role of roles) {
            await this.backend.remove(transaction, this.options.buckets.roles, role, userId);
        }
    } else {
        await this.backend.remove(transaction, this.options.buckets.roles, roles, userId);
    }

    return await this.backend.end(transaction);
};

/**
  userRoles( userId )

  Return all the roles from a given user.

  @param {String} User id.
  @return {Promise} Promise resolved with an array of user roles
*/
Acl.prototype.userRoles = async function (userId) {
    return await this.backend.get(this.options.buckets.users, userId);
};

/**
    roleUsers( roleName ) : users

    Return all users who has a given role.
    @param {String} rolename.
    @return {Promise} Promise resolved with an array of users
 */
Acl.prototype.roleUsers = function (roleName) {
    return this.backend.get(this.options.buckets.roles, roleName);
};

/**
  hasRole( userId, rolename ) : is_in_role

  Return boolean whether user is in the role

  @param {String} User id.
  @param {String} rolename.
  @return {Promise} Promise resolved with boolean of whether user is in role
*/
Acl.prototype.hasRole = async function (userId, rolename) {
    let roles = await this.userRoles(userId);
    return roles.indexOf(rolename) !== -1;
};

/**
  addRoleParents( role, parents )

  Adds a parent or parent list to role.

  @param {String} Child role.
  @param {String|Array} Parent role(s) to be added.
  @return {Promise} Promise resolved when finished
*/
Acl.prototype.addRoleParents = async function (role, parents) {
    contract(arguments).params("string", "string|array").end();

    const transaction = await this.backend.begin();
    await this.backend.add(transaction, this.options.buckets.meta, "roles", role);
    await this.backend.add(transaction, this.options.buckets.parents, role, parents);
    return await this.backend.end(transaction);
};

/**
  removeRoleParents( role, parents )

  Removes a parent or parent list from role.

  If `parents` is not specified, removes all parents.

  @param {String} Child role.
  @param {String|Array} Parent role(s) to be removed [optional].
  @return {Promise} Promise resolved when finished.
*/
Acl.prototype.removeRoleParents = async function (role, parents) {
    contract(arguments).params("string", "string|array").params("string").end();

    const transaction = await this.backend.begin();
    if (parents) {
        await this.backend.remove(transaction, this.options.buckets.parents, role, parents);
    } else {
        await this.backend.del(transaction, this.options.buckets.parents, role);
    }
    return await this.backend.end(transaction);
};

/**
  removeRole( role )

  Removes a role from the system.

  @param {String} Role to be removed
*/
Acl.prototype.removeRole = async function (role) {
    contract(arguments).params("string").end();

    // Note that this is not fully transactional.
    let resources = await this.backend.get(this.options.buckets.resources, role);
    const transaction = await this.backend.begin();
    for (const resource of resources) {
        const bucket = allowsBucket(resource);
        await this.backend.del(transaction, bucket, role);
    }
    await this.backend.del(transaction, this.options.buckets.resources, role);
    await this.backend.del(transaction, this.options.buckets.parents, role);
    await this.backend.del(transaction, this.options.buckets.roles, role);
    await this.backend.remove(transaction, this.options.buckets.meta, "roles", role);
    return await this.backend.end(transaction);
};

/**
  removeResource( resource )

  Removes a resource from the system

  @param {String} Resource to be removed
  @return {Promise} Promise resolved when finished
*/
Acl.prototype.removeResource = async function (resource) {
    contract(arguments).params("string").end();

    let roles = await this.backend.get(this.options.buckets.meta, "roles");
    const transaction = await this.backend.begin();
    await this.backend.del(transaction, allowsBucket(resource), roles);
    for (const role of roles) {
        await this.backend.remove(transaction, this.options.buckets.resources, role, resource);
    }
    return await this.backend.end(transaction);
};

/**
  allow( roles, resources, permissions )

  Adds the given permissions to the given roles over the given resources.

  @param {String|Array} role(s) to add permissions to.
  @param {String|Array} resource(s) to add permisisons to.
  @param {String|Array} permission(s) to add to the roles over the resources.

  allow( permissionsArray )

  @param {Array} Array with objects expressing what permissions to give.

  [{roles:{String|Array}, allows:[{resources:{String|Array}, permissions:{String|Array}]]

  @return {Promise} Promise resolved when finished
*/
Acl.prototype.allow = async function (roles, resources, permissions) {
    contract(arguments).params("string|array", "string|array", "string|array").params("array").end();

    if (arguments.length === 1 || (arguments.length === 2 && _.isObject(roles))) {
        return await this._allowEx(roles);
    } else {
        roles = makeArray(roles);
        resources = makeArray(resources);

        const transaction = await this.backend.begin();

        await this.backend.add(transaction, this.options.buckets.meta, "roles", roles);

        for (const resource of resources) {
            for (const role of roles) {
                await this.backend.add(transaction, allowsBucket(resource), role, permissions);
            }
        }

        for (const role of roles) {
            await this.backend.add(transaction, this.options.buckets.resources, role, resources);
        }

        return await this.backend.end(transaction);
    }
};

Acl.prototype.removeAllow = function (role, resources, permissions) {
    contract(arguments).params("string", "string|array", "string|array").params("string", "string|array").end();

    resources = makeArray(resources);
    if (permissions) {
        permissions = makeArray(permissions);
    }

    return this.removePermissions(role, resources, permissions);
};

/**
  removePermissions( role, resources, permissions)

  Remove permissions from the given roles owned by the given role.

  Note: we loose atomicity when removing empty role_resources.

  @param {String}
  @param {String|Array}
  @param {String|Array}
*/
Acl.prototype.removePermissions = async function (role, resources, permissions) {
    const transaction = await this.backend.begin();
    for (const resource of resources) {
        const bucket = allowsBucket(resource);
        if (permissions) {
            await this.backend.remove(transaction, bucket, role, permissions);
        } else {
            await this.backend.del(transaction, bucket, role);
            await this.backend.remove(transaction, this.options.buckets.resources, role, resource);
        }
    }

    // Remove resource from role if no rights for that role exists.
    // Not fully atomic...
    await this.backend.end(transaction);

    const transaction2 = await this.backend.begin();
    await Promise.all(
        resources.map(async (resource) => {
            const bucket = allowsBucket(resource);
            let permissions1 = await this.backend.get(bucket, role);
            if (permissions1.length === 0) {
                await this.backend.remove(transaction2, this.options.buckets.resources, role, resource);
            }
        })
    );
    return await this.backend.end(transaction2);
};

/**
  allowedPermissions( userId, resources ) : obj

  Returns all the allowable permissions a given user have to
  access the given resources.

  It returns an array of objects where every object maps a
  resource name to a list of permissions for that resource.

  @param {String} User id.
  @param {String|Array} resource(s) to ask permissions for.
*/
Acl.prototype.allowedPermissions = async function (userId, resources) {
    if (!userId) return {};

    contract(arguments).params("string", "string|array").end();

    if (this.backend.unions) {
        return this.optimizedAllowedPermissions(userId, resources);
    }

    resources = makeArray(resources);

    const roles = await this.userRoles(userId);
    const result = {};
    await Promise.all(
        resources.map(async (resource) => {
            result[resource] = await this._resourcePermissions(roles, resource);
        })
    );
    return result;
};

/**
  optimizedAllowedPermissions( userId, resources ): obj

  Returns all the allowable permissions a given user have to
  access the given resources.

  It returns a map of resource name to a list of permissions for that resource.

  This is the same as allowedPermissions, it just takes advantage of the unions
  function if available to reduce the number of backend queries.

  @param {String} User id.
  @param {String|Array} resource(s) to ask permissions for.
*/
Acl.prototype.optimizedAllowedPermissions = async function (userId, resources) {
    if (!userId) return {};

    contract(arguments).params("string", "string|array").end();

    resources = makeArray(resources);
    let response;
    const roles = await this._allUserRoles(userId);
    const buckets = resources.map(allowsBucket);
    if (roles.length === 0) {
        const emptyResult = {};
        for (const bucket of buckets) {
            emptyResult[bucket] = [];
        }
        response = emptyResult;
    } else {
        response = await this.backend.unions(buckets, roles);
    }

    const result = {};
    for (const bucket of Object.keys(response)) {
        result[keyFromAllowsBucket(bucket)] = response[bucket];
    }

    return result;
};

/**
  isAllowed( userId, resource, permissions )

  Checks if the given user is allowed to access the resource for the given
  permissions (note: it must fulfill all the permissions).

  @param {String} User id.
  @param {String|Array} resource(s) to ask permissions for.
  @param {String|Array} asked permissions.
*/
Acl.prototype.isAllowed = async function (userId, resource, permissions) {
    contract(arguments).params("string", "string", "string|array").end();

    let roles = await this.backend.get(this.options.buckets.users, userId);
    if (roles.length) {
        return this.areAnyRolesAllowed(roles, resource, permissions);
    } else {
        return false;
    }
};

/**
  areAnyRolesAllowed( roles, resource, permissions ) : allowed

  Returns true if any of the given roles have the right permissions.

  @param {String|Array} Role(s) to check the permissions for.
  @param {String} resource(s) to ask permissions for.
  @param {String|Array} asked permissions.
*/
Acl.prototype.areAnyRolesAllowed = async function (roles, resource, permissions) {
    contract(arguments).params("string|array", "string", "string|array").end();

    roles = makeArray(roles);
    permissions = makeArray(permissions);

    if (roles.length === 0) {
        return false;
    } else {
        return await this._checkPermissions(roles, resource, permissions);
    }
};

/**
  whatResources(role) : {resourceName: [permissions]}

  Returns what resources a given role or roles have permissions over.

  whatResources(role, permissions) : resources

  Returns what resources a role has the given permissions over.

  @param {String|Array} Roles
  @param {String|Array} Permissions
*/
Acl.prototype.whatResources = function (roles, permissions) {
    contract(arguments).params("string|array").params("string|array", "string|array").end();

    roles = makeArray(roles);
    permissions = !permissions ? undefined : makeArray(permissions);

    return this.permittedResources(roles, permissions);
};

Acl.prototype.permittedResources = async function (roles, permissions) {
    const result = _.isUndefined(permissions) ? {} : [];
    let resources = await this._rolesResources(roles);
    await Promise.all(
        resources.map(async (resource) => {
            let p = await this._resourcePermissions(roles, resource);
            if (permissions) {
                const commonPermissions = _.intersection(permissions, p);
                if (commonPermissions.length > 0) {
                    result.push(resource);
                }
            } else {
                result[resource] = p;
            }
        })
    );

    return result;
};

/**
  Express Middleware
*/
Acl.prototype.middleware = function (numPathComponents, userId, actions) {
    contract(arguments)
        .params()
        .params("number")
        .params("number", "string|number|function")
        .params("number", "string|number|function", "string|array")
        .end();

    const acl = this;

    function HttpError(errorCode, msg) {
        this.errorCode = errorCode;
        this.message = msg;
        this.name = this.constructor.name;

        Error.captureStackTrace(this, this.constructor);
        this.constructor.prototype.__proto__ = Error.prototype;
    }

    return function (req, res, next) {
        let _userId = userId,
            _actions = actions,
            resource,
            url;

        // call function to fetch userId
        if (typeof userId === "function") {
            _userId = userId(req, res);
        }
        if (!userId) {
            if (req.session && req.session.userId) {
                _userId = req.session.userId;
            } else if (req.user && req.user.id) {
                _userId = req.user.id;
            } else {
                next(new HttpError(401, "User not authenticated"));
                return;
            }
        }

        // Issue #80 - Additional check
        if (!_userId) {
            next(new HttpError(401, "User not authenticated"));
            return;
        }

        url = req.originalUrl.split("?")[0];
        if (!numPathComponents) {
            resource = url;
        } else {
            resource = url
                .split("/")
                .slice(0, numPathComponents + 1)
                .join("/");
        }

        if (!_actions) {
            _actions = req.method.toLowerCase();
        }

        acl.logger ? acl.logger.debug("Requesting " + _actions + " on " + resource + " by user " + _userId) : null;

        acl.isAllowed(_userId, resource, _actions)
            .then(async (allowed) => {
                if (allowed === false) {
                    if (acl.logger) {
                        acl.logger.debug("Not allowed " + _actions + " on " + resource + " by user " + _userId);
                        const obj = acl.allowedPermissions(_userId, resource);
                        acl.logger.debug("Allowed permissions: " + util.inspect(obj));
                    }
                    next(new HttpError(403, "Insufficient permissions to access resource"));
                } else {
                    acl.logger
                        ? acl.logger.debug("Allowed " + _actions + " on " + resource + " by user " + _userId)
                        : null;
                    next();
                }
            })
            .catch(() => next(new Error("Error checking permissions to access resource")));
    };
};

/**
  Error handler for the Express middleware

  @param {String} [contentType] (html|json) defaults to plain text
*/
Acl.prototype.middleware.errorHandler = function (contentType) {
    let method = "end";

    if (contentType) {
        switch (contentType) {
            case "json":
                method = "json";
                break;
            case "html":
                method = "send";
                break;
        }
    }

    return function (err, req, res, next) {
        if (err.name !== "HttpError" || !err.errorCode) return next(err);
        res.status(err.errorCode)[method](err.message);
    };
};

//-----------------------------------------------------------------------------
//
// Private methods
//
//-----------------------------------------------------------------------------

//
// Same as allow but accepts a more compact input.
//
Acl.prototype._allowEx = function (objs) {
    objs = makeArray(objs);

    const demuxed = [];
    for (const obj of objs) {
        const roles = obj.roles;
        for (const allow of obj.allows) {
            demuxed.push({
                roles: roles,
                resources: allow.resources,
                permissions: allow.permissions,
            });
        }
    }

    return Promise.all(demuxed.map((obj) => this.allow(obj.roles, obj.resources, obj.permissions)));
};

//
// Returns the parents of the given roles
//
Acl.prototype._rolesParents = function (roles) {
    return this.backend.union(this.options.buckets.parents, roles);
};

//
// Return all roles in the hierarchy including the given roles.
//
Acl.prototype._allRoles = async function (roleNames) {
    let parents = await this._rolesParents(roleNames);
    if (parents.length > 0) {
        let parentRoles = await this._allRoles(parents);
        return _.union(roleNames, parentRoles);
    }

    return roleNames;
};

//
// Return all roles in the hierarchy of the given user.
//
Acl.prototype._allUserRoles = async function (userId) {
    let roles = await this.userRoles(userId);
    if (roles && roles.length > 0) {
        return this._allRoles(roles);
    }

    return [];
};

//
// Returns an array with resources for the given roles.
//
Acl.prototype._rolesResources = async function (roles) {
    roles = makeArray(roles);

    let allRoles = await this._allRoles(roles);
    let result = [];
    await Promise.all(
        allRoles.map((role) =>
            this.backend.get(this.options.buckets.resources, role).then((resources) => {
                result = result.concat(resources);
            })
        )
    );
    return result;
};

//
// Returns the permissions for the given resource and set of roles
//
Acl.prototype._resourcePermissions = async function (roles, resource) {
    if (roles.length === 0) {
        return [];
    }

    const resourcePermissions = await this.backend.union(allowsBucket(resource), roles);

    const parents = await this._rolesParents(roles);
    if (parents && parents.length) {
        const morePermissions = await this._resourcePermissions(parents, resource);
        return _.union(resourcePermissions, morePermissions);
    }

    return resourcePermissions;
};

//
// NOTE: This function will not handle circular dependencies and result in a crash.
//
Acl.prototype._checkPermissions = async function (roles, resource, permissions) {
    let resourcePermissions = await this.backend.union(allowsBucket(resource), roles);
    if (resourcePermissions.indexOf("*") !== -1) {
        return true;
    }

    permissions = permissions.filter((p) => resourcePermissions.indexOf(p) === -1);
    if (permissions.length === 0) {
        return true;
    }

    let parents = await this.backend.union(this.options.buckets.parents, roles);
    if (parents && parents.length) {
        return await this._checkPermissions(parents, resource, permissions);
    }

    return false;
};

//-----------------------------------------------------------------------------
//
// Helpers
//
//-----------------------------------------------------------------------------

function makeArray(arr) {
    return Array.isArray(arr) ? arr : [arr];
}

function allowsBucket(role) {
    return "allows_" + role;
}

function keyFromAllowsBucket(str) {
    return str.replace(/^allows_/, "");
}

// -----------------------------------------------------------------------------------

exports = module.exports = Acl;
