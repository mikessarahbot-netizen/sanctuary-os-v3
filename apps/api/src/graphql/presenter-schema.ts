import { makeExecutableSchema } from "@graphql-tools/schema";
import { GraphQLScalarType, Kind, valueFromASTUntyped, type GraphQLSchema } from "graphql";
import {
  chartsGraphqlTypeDefs,
  createChartsGraphqlResolvers,
  type ChartsGraphqlResolverDependencies
} from "./charts.js";
import {
  createPlayGraphqlResolvers,
  playGraphqlTypeDefs,
  type PlayGraphqlResolverDependencies
} from "./play.js";
import {
  createPresenterGraphqlResolvers,
  presenterGraphqlTypeDefs,
  type PresenterGraphqlResolverDependencies
} from "./presenter.js";

/**
 * Assemble the executable API GraphQL schema.
 *
 * The Presenter SDL only `extend`s `Query`/`Mutation` and declares `scalar
 * DateTime` while using `JSON` for opaque inputs, so the base type defs supply
 * the root `Query`/`Mutation` and the `JSON` scalar. Both scalars are
 * pass-through: variables arrive already parsed, literals are converted with
 * graphql's untyped AST reader. The Charts SDL also `extend`s the roots and
 * reuses the `DateTime` scalar the Presenter SDL declares, so it is only merged
 * in when Charts dependencies are supplied. The Play SDL likewise `extend`s the
 * roots and reuses the `DateTime` scalar, so it is only merged in when Play
 * dependencies are supplied. Planning is not wired here yet; this schema is the
 * surface the desktop replay transport executes.
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

export interface ApiGraphqlSchemaDependencies extends PresenterGraphqlResolverDependencies {
  readonly charts?: ChartsGraphqlResolverDependencies;
  readonly play?: PlayGraphqlResolverDependencies;
}

export const createPresenterGraphqlSchema = (
  dependencies: ApiGraphqlSchemaDependencies
): GraphQLSchema => {
  const presenterResolvers = createPresenterGraphqlResolvers(dependencies);
  const chartsResolvers =
    dependencies.charts !== undefined
      ? createChartsGraphqlResolvers(dependencies.charts)
      : undefined;
  const playResolvers =
    dependencies.play !== undefined
      ? createPlayGraphqlResolvers(dependencies.play)
      : undefined;

  return makeExecutableSchema({
    resolvers: {
      DateTime: DateTimeScalar,
      JSON: JsonScalar,
      Mutation: {
        ...presenterResolvers.Mutation,
        ...(chartsResolvers !== undefined ? chartsResolvers.Mutation : {}),
        ...(playResolvers !== undefined ? playResolvers.Mutation : {})
      },
      Query: {
        ...presenterResolvers.Query,
        ...(chartsResolvers !== undefined ? chartsResolvers.Query : {}),
        ...(playResolvers !== undefined ? playResolvers.Query : {})
      }
    },
    typeDefs: [
      baseTypeDefs,
      presenterGraphqlTypeDefs,
      ...(chartsResolvers !== undefined ? [chartsGraphqlTypeDefs] : []),
      ...(playResolvers !== undefined ? [playGraphqlTypeDefs] : [])
    ]
  });
};
