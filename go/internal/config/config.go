// Supports reading config files and unmarshaling the values in a user defined struct

package config

import (
	"github.com/pkg/errors"
	"github.com/spf13/viper"
)

// Load reads in the config file at the specified path and unmarshals the values into your config struct
func Load(path string, config interface{}) error {
	viper.SetConfigFile(path)
	if err := viper.ReadInConfig(); err != nil {
		return errors.Wrap(err, "failed to read config")
	}

	if err := viper.Unmarshal(config); err != nil {
		return errors.Wrap(err, "failed to unmarshal config")
	}

	return nil
}
