import { Router } from "express";
import type { Server as IOServer, Socket as IOSocket } from "socket.io";
import { schema, GraphQLContextType } from "../graphql";
import { createChat } from "../chat";
import { createUser } from "../user";
import type { Database } from "sqlite";
import type {
  SocketSessionStore,
  SocketSessionRecord,
} from "../socket-session-store";
import { registerSocketIOGraphQLServer } from "@n1ru4l/socket-io-graphql-server";
import { InMemoryLiveQueryStore } from "@n1ru4l/in-memory-live-query-store";
import { createSplashImageState } from "../splash-image-state";
import { createPubSub } from "../pubsub";
import { NotesUpdatesPayload, NoteUpdatePayload } from "../notes-lib";

type Dependencies = {
  roleMiddleware: any;
  socketSessionStore: SocketSessionStore;
  db: Database;
  socketServer: IOServer;
};

export default ({ socketServer, socketSessionStore, db }: Dependencies) => {
  const chat = createChat();
  const user = createUser({
    sendUserConnectedMessage: ({ name }) =>
      chat.addOperationalMessage({ content: `**${name}** connected.` }),
    sendUserDisconnectedMessage: ({ name }) =>
      chat.addOperationalMessage({ content: `**${name}** disconnected.` }),
  });
  const splashImageState = createSplashImageState();

  const router = Router();

  const getSession = (socket: IOSocket): SocketSessionRecord => {
    const session = socketSessionStore.get(socket);
    if (!session) {
      throw new Error("Unexpected error occurred. WebSocket has no session.");
    }
    return session;
  };

  const liveQueryStore = new InMemoryLiveQueryStore();

  const notesUpdates = createPubSub<NotesUpdatesPayload>();
  const noteUpdate = createPubSub<NoteUpdatePayload>();

  const socketIOGraphQLServer = registerSocketIOGraphQLServer({
    socketServer,
    isLazy: true,
    getParameter: ({ socket }) => ({
      execute: liveQueryStore.execute,
      graphQLExecutionParameter: {
        schema,
        contextValue: {
          chat,
          user,
          db,
          session: getSession(socket),
          liveQueryStore,
          splashImageState,
          socket,
          notesUpdates,
          noteUpdate,
        } as GraphQLContextType,
      },
    }),
  });

  return { router, socketIOGraphQLServer };
};
