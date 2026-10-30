// Compiles actual application components with isolated navigation/API fixtures for visual QA.
// Never builds into public/ or ships a test route with the application.
const path = require("path"),
  fs = require("fs");
const webpack = require("next/dist/compiled/webpack/webpack").webpack;
const root = process.cwd();
webpack(
  {
    mode: "development",
    devtool: false,
    entry: path.join(root, "tests/ui/main.tsx"),
    output: {
      path: path.join(root, ".local/ui"),
      filename: "app.js",
      publicPath: "/",
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
      alias: {
        "@/lib/supabase/browser$": path.join(root, "tests/ui/browser.ts"),
        "@": path.join(root, "src"),
        "next/link": path.join(root, "tests/ui/link.tsx"),
        "next/navigation": path.join(root, "tests/ui/navigation.ts"),
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: path.join(root, "scripts/ui-typescript-loader.cjs"),
        },
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(
          "https://example.invalid",
        ),
        "process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY": JSON.stringify(""),
      }),
    ],
  },
  (error, stats) => {
    if (error || stats.hasErrors()) {
      console.error(error || stats.toString({ all: false, errors: true }));
      process.exitCode = 1;
      return;
    }
    const css = fs
      .readdirSync(".next/static/css")
      .filter((f) => f.endsWith(".css"))
      .map((f) => fs.readFileSync(".next/static/css/" + f, "utf8"))
      .join("\n");
    fs.writeFileSync(".local/ui/style.css", css);
    console.log(
      "Isolated UI QA harness compiled. No production routes changed.",
    );
  },
);
