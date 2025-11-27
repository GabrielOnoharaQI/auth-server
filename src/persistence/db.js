import { config } from "../shared/config.js"
import MongoAdapter from "./types/mongodb.js"
import DynamoDBAdapter from "./types/dynamodb.js"
import MemoryAdapter from "./types/memorydb.js"
import PostgresAdapter from "./types/postgres.db.js"

export const getDBAdapter = async function() {
    let adapter = null;

    if (config.db.type === "mongodb") {
        adapter = await MongoAdapter.connect();
    } else if (config.db.type === "dynamodb") {
        adapter = DynamoDBAdapter;
    } else if (config.db.type === "memorydb") {
        adapter = MemoryAdapter;
    } else if (config.db.type === "postgres") {
        // O método connect() que criamos retorna a classe, não uma instância
        // O oidc-provider instancia a classe internamente fazendo `new Adapter('AccessToken')`
        adapter = await PostgresAdapter.connect();
    } else {
        console.error("O tipo de banco de dados não foi configurado... abortando inicialização");
        process.exit(1);
    }
    
    return adapter;
}