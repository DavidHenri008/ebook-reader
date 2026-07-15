import { RouterProvider } from "@tanstack/react-router";
import { AuthGate } from "./auth";
import { router } from "./router";

function App() {
  return (
    <AuthGate>
      <RouterProvider router={router} />
    </AuthGate>
  );
}

export default App;
