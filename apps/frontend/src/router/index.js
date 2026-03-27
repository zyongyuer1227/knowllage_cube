import { createRouter, createWebHistory } from "vue-router";
import AdminPage from "../views/AdminPage.vue";
import GuestPage from "../views/GuestPage.vue";
export const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: "/", name: "guest", component: GuestPage },
        { path: "/admin", name: "admin", component: AdminPage }
    ]
});
