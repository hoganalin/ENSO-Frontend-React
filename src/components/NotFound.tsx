function NotFound(): JSX.Element {
  return (
    <div className="max-w-[1180px] mx-auto">
      <div
        style={{
          minHeight: "400px",
          backgroundImage:
            "url(https://images.unsplash.com/photo-1480399129128-2066acb5009e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=1950&q=80)",
          backgroundPosition: "center center",
        }}
      ></div>
      <div className="mt-5 mb-7">
        <div className="row">
          <div className="col-md-6">
            <h2>404 - Page Not Found</h2>
            <p>
              The page you are looking for does not exist or has been moved.
            </p>
            <a
              href="/"
              className="btn btn-outline-dark me-2 rounded-0 mb-4"
            >
              Back To Home
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NotFound;
