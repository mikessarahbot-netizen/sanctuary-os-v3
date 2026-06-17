import { makeExecutableSchema } from "@graphql-tools/schema";
import { GraphQLScalarType, Kind, valueFromASTUntyped, type GraphQLSchema } from "graphql";
import {
  createPresenterGraphqlResolvers,
  presenterGraphqlTypeDefs,
  type PresenterGraphqlResolverDependencies
} from "./presenter.js";

/**
 * Assemble the executable Presenter GraphQL schema.
 *
 * The Presenter SDL only `extend`s `Query`/`Mutation` and declares `scalar
 * DateTime` while using `JSON` for opaque inputs, so the base type defs supply
 * the root `Query`/`Mutation` and the `JSON` scalar. Both scalars are
 * pass-through: variables arrive already parsed, literals are converted with
 * graphql's untyped AST reader. Planning is not wired here yet; this schema is
 * the Presenter surface the desktop replay transport executes.
 */
const baseTypeDefs = `
  scalar JSON

  type Query {
    _empty: Boolean
  }

  type Mutation {
    _empty: Boolean
  }
`;

const DateTimeScalar = new GraphQLScalarType({
  name: "DateTime",
  parseLiteral: (ast) => (ast.kind === Kind.STRING ? ast.value : null),
  parseValue: (value) => value,
  serialize: (value) => value
});

const JsonScalar = new GraphQLScalarType({
  name: "JSON",
  parseLiteral: (ast) => valueFromASTUntyped(ast),
  parseValue: (value) => value,
  serialize: (value) => value
});

export const createPresenterGraphqlSchema = (
  dependencies: PresenterGraphqlResolverDependencies
): GraphQLSchema => {
  const resolvers = createPresenterGraphqlResolvers(dependencies);

  return makeExecutableSchema({
    resolvers: {
      DateTime: DateTimeScalar,
      JSON: JsonScalar,
      Mutation: resolvers.Mutation,
      Query: resolvers.Query
    },
    typeDefs: [baseTypeDefs, presenterGraphqlTypeDefs]
  });
};
