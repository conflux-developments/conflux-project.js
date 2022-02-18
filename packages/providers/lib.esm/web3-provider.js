"use strict";
import { defineReadOnly } from "@confluxproject/properties";
import { getBase32AddressFromHex40 } from "@confluxproject/address";
import { Logger } from "@confluxproject/logger";
import { version } from "./_version";
const logger = new Logger(version);
import { JsonRpcProvider } from "./json-rpc-provider";
let _nextId = 1;
function buildWeb3LegacyFetcher(provider, sendFunc) {
    return function (method, params) {
        // Metamask complains about eth_sign (and on some versions hangs)
        if (method == "eth_sign" && provider.isMetaMask) {
            // https://github.com/ethereum/go-ethereum/wiki/Management-APIs#personal_sign
            method = "personal_sign";
            params = [params[1], params[0]];
        }
        const request = {
            method: method,
            params: params,
            id: (_nextId++),
            jsonrpc: "2.0"
        };
        return new Promise((resolve, reject) => {
            sendFunc(request, function (error, result) {
                if (error) {
                    return reject(error);
                }
                if (result.error) {
                    const error = new Error(result.error.message);
                    error.code = result.error.code;
                    error.data = result.error.data;
                    return reject(error);
                }
                resolve(result.result);
            });
        });
    };
}
function buildEip1193Fetcher(provider) {
    return function (method, params) {
        if (params == null) {
            params = [];
        }
        // Metamask complains about eth_sign (and on some versions hangs)
        if (method == "eth_sign" && provider.isMetaMask) {
            // https://github.com/ethereum/go-ethereum/wiki/Management-APIs#personal_sign
            method = "personal_sign";
            params = [params[1], params[0]];
        }
        return provider.request({ method, params });
    };
}
export class Web3Provider extends JsonRpcProvider {
    constructor(provider, network) {
        logger.checkNew(new.target, Web3Provider);
        if (provider == null) {
            logger.throwArgumentError("missing provider", "provider", provider);
        }
        let path = null;
        let jsonRpcFetchFunc = null;
        let subprovider = null;
        if (typeof (provider) === "function") {
            path = "unknown:";
            jsonRpcFetchFunc = provider;
        }
        else {
            path = provider.host || provider.path || "";
            if (!path && provider.isMetaMask) {
                path = "metamask";
            }
            subprovider = provider;
            if (provider.request) {
                if (path === "") {
                    path = "eip-1193:";
                }
                jsonRpcFetchFunc = buildEip1193Fetcher(provider);
            }
            else if (provider.sendAsync) {
                jsonRpcFetchFunc = buildWeb3LegacyFetcher(provider, provider.sendAsync.bind(provider));
            }
            else if (provider.send) {
                jsonRpcFetchFunc = buildWeb3LegacyFetcher(provider, provider.send.bind(provider));
            }
            else {
                logger.throwArgumentError("unsupported provider", "provider", provider);
            }
            if (!path) {
                path = "unknown:";
            }
        }
        super(path, network);
        defineReadOnly(this, "jsonRpcFetchFunc", jsonRpcFetchFunc);
        defineReadOnly(this, "provider", subprovider);
    }
    send(method, params) {
        method = method.replace("eth_", "cfx_");
        method = method.replace("getTransactionCount", "getNextNonce");
        method = method.replace(/estimateGas$/, "estimateGasAndCollateral");
        method = method.replace("getBlockByNumber", "getBlockByEpochNumber");
        method = method.replace("cfx_epochNumber", "cfx_epochNumber");
        method = method.replace("net_version", "cfx_chainId");
        // fix conflux compatible bugs
        method = method === "cfx_signTypedData_v4_old" ? "eth_signTypedData_v4" : (method.replace("eth", "cfx"));
        if (params && params.length > 0) {
            const index = params.indexOf("latest");
            if (index >= 0) {
                params[index] = "latest_state";
            }
            const chainId = this.network ? this.network.chainId : 1029;
            if (params[0] && params[0].to) {
                params[0].to = getBase32AddressFromHex40(params[0].to, chainId);
            }
            if (params[0] && params[0].from) {
                params[0].from = getBase32AddressFromHex40(params[0].from, chainId);
            }
        }
        return this.jsonRpcFetchFunc(method, params);
    }
}
//# sourceMappingURL=web3-provider.js.map