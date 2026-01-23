// Structured logging with field annotation support.
// Details about where the log was called from are included.

package log

import (
	"github.com/sirupsen/logrus"
)

// Fields is an alias to logrus.Fields
type Fields = logrus.Fields

// Logger wraps a logrus.FieldLogger to provide all standard logging functionality
type Logger interface {
	logrus.FieldLogger
}

var logger Logger

func init() {
	logger = logrus.StandardLogger()

	logrus.SetLevel(logrus.DebugLevel)
	logrus.SetReportCaller(true)
	logrus.SetFormatter(&logrus.JSONFormatter{
		TimestampFormat: "2006-01-02 15:04:05",
		PrettyPrint:     false,
	})
}

// WithFields adds field annotations to the logger instance
func WithFields(fields Fields) Logger {
	return logger.WithFields(fields)
}

// WithoutFields uses the default logger with no extra field annotations
func WithoutFields() Logger {
	return logger
}
